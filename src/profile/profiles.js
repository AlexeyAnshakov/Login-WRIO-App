import {ObjectID} from 'mongodb';
import {Promise} from 'es6-promise';
import db from '../db'
import PassportSessions from '../dbmodels/session.js'
import WrioUsers from '../dbmodels/wriouser.js'
import {dumpError} from '../utils.js'
import request from 'superagent'
import nconf from '../wrio_nconf.js'

function generateWrioID() {
    var min = 100000000000;
    var max = 999999999999;
    var id = Math.floor(Math.random() * (max - min) + min);
    return id;
}

/* Helper func */

var checkIdExists = async (wrioID) => {
    var wrioUsers = new WrioUsers();
    try {
        await wrioUsers.getByWrioID(wrioID);
        return true;
    } catch (e) {
        return false;
    }
};

/* Creation of temporary wrioID */

var storageCreateTempAccount = async (session) => {
    var wrioUsers = new WrioUsers();
    var id = generateWrioID();
    if (await checkIdExists(id)) {
        return await storageCreateTempAccount(session); // call ourselves until we find unique ID
    } else {
        var profile = {
            wrioID: id.toString(),
            temporary: true,
            created: new Date().getTime()
        };
        console.log("Creating new user profile",profile);
        var user = await wrioUsers.create(profile);
        return user;
    }
};

/* Save template records for the user to S3 */

var requestSave = (sid) => {
        console.log(sid); // TODO: change to safer auth method
        let api_request = "http://storage"+nconf.get('server:workdomain')+'/api/save_templates?sid='+sid;
        console.log("Sending save profile request",api_request);
        request.get(api_request).end((err,result) => {
            if (err) {
                console.log(err);
                return
            }
            //console.log("Request save result",result.body);
        });
};

/*
 If session have no user information, then create temporary wrioID
 returns old or new wrioID
*/

var saveWrioIDForSession = async (ssid,request) => {
    var passportSessions = new PassportSessions();
    var wrioUser = new WrioUsers();
    try {
        var sessionData = request.session;

        if (sessionData.passport) {
            if (sessionData.passport.user) {
                console.log("Session already have valid user, exit....");
                var user = await wrioUser.get({_id:ObjectID(sessionData.passport.user)});
                return user.wrioID;
            }
        }
        var user = await storageCreateTempAccount();

        request.session.passport = { // persist newly created user into the current session
            user: user._id
        };
        setTimeout(()=> {
            // TODO this is just a hack, do more reliable solution
            requestSave(ssid) ;// give storage command to create S3 profile
        },3000);

        return user.wrioID;

    } catch (e) {
        console.log("Error durion saveWrioIDForSession",e);
        dumpError(e);
    }

};

export default saveWrioIDForSession;