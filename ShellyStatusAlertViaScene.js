/*
Created by Leivo Sepp, 2025
Licensed under the MIT License
https://github.com/LeivoSepp/Shelly-Status-Alerts-via-Scenes

Shelly Device Status Alerts via Scenes

This script tracks the online status of remote Shelly devices and 
triggers Shelly scenes to notify users when devices go offline or come back online.

Please set the following parameters in the KVS after the initial run of the script.
  "url": "https://xxx-xx-xx.shelly.cloud/",
  "apiKey": "your API key",
  "SceneIdOffline": "SceneId",
  "SceneIdOnline": "SceneId",

How to get the API key and URL:
1. Go to https://control.shelly.cloud/
2. Click Settings -> "Authorization cloud key" -> Get key.
3. Copy the API key, Shelly cloud URL and save them in the KVS

How to get the SceneId:
1. Go to https://control.shelly.cloud/
2. Click on the Scenes -> open the scene -> Informaton -> copy the Scene ID and save it in the KVS
3. Repeat the steps for the other scene.

Set the devices in the CONF.dvsc array to monitor. 
The id is the device id (mac address) and the name is anything you like to call it.
{ id: "1234567890", name: "My garage Pro 3EM" },

How to get the device id:
1. Go to https://control.shelly.cloud/
2. Click on the room -> device -> Settings -> Device Information
3. Copy the DeviceId (MAC address) and save it in the script
4. Repeat the steps for the other devices

The script will check the online status and then loop to next device.
If all devices are offline, the scene with the id CONF.scOf will be triggered.
If any device is back online, the scene with the id CONF.scOn will be triggered.

There are two non documented API calls that can be used to manage Shelly scenes.
- scene/manual_run?auth_key=apiKey&id=SceneId
- scene/enable?enabled=true&auth_key=apiKey&id=SceneId
- scene/enable?enabled=false&auth_key=apiKey&id=SceneId
*/

const CONF = {
    dvsc: [
        { id: "123456789", name: "Nibe heating" },
        { id: "123456789", name: "Main Pro 3EM" },
        { id: "123456789", name: "Garage Shelly" },
    ],
    ping: 600,      //time in seconds before next device check 
    url: '',        //url to the Shelly cloud
    apiK: '',       //API key
    scOf: '',       //scene id for offline
    scOn: '',       //scene id for online
    sRun: "scene/manual_run",
    ver: "1.1",
};

let noFl = CONF.dvsc.length;    //# of devices after which the scene is triggered
let dIdx = 0;                   //device index
let fCnt = 0;                   //failure counter
let fail = false;               //is failure
let ok = true;                  //is ok

const sId = Shelly.getCurrentScriptId();

function strt() {
    if (!Shelly.getComponentConfig("script", sId).enable) {
        Shelly.call('Script.SetConfig', { id: sId, config: { enable: true } });
    }
}

function getK() {
    Shelly.call('KVS.Get', { key: "ShellyAlertsViaScene" + sId },
        function (res, err) {
            if (err !== 0) {
                let val = {
                    url: "url",
                    apiKey: "your_API_key",
                    SceneIdOffline: "sceneId",
                    SceneIdOnline: "sceneId",
                    Version: CONF.ver
                };
                print("API key and configuration parameters must be set in KVS.");
                Shelly.call('KVS.Set', { key: "ShellyAlertsViaScene" + sId, value: JSON.stringify(val) });
                Shelly.call('Script.Stop', { id: sId });
                return;
            }
            CONF.apiK = JSON.parse(res.value).apiKey;
            CONF.url = JSON.parse(res.value).url;
            CONF.scOf = JSON.parse(res.value).SceneIdOffline;
            CONF.scOn = JSON.parse(res.value).SceneIdOnline;
        });
}
// send scene
function Scen(id) {
    const url = CONF.url + CONF.sRun + "?auth_key=" + CONF.apiK + "&id=" + id;
    Shelly.call(
        "HTTP.GET", {
        "url": url,
        "content_type": " application/json",
    }, function (res, err, msg) {
        if (err !== 0 || res === null || res.code != 200) {
            print(err, msg);
            return;
        }
        print(JSON.parse(res.body).isok ? "Scene executed" : "Scene was not executed");
    });
}

function pngD() {
    Shelly.call(
        "HTTP.POST", {
        "url": CONF.url + "/device/status ",
        "content_type": " application/json",
        "body": JSON.stringify({ id: CONF.dvsc[dIdx].id, auth_key: CONF.apiK }),
    }, function (res, err, msg) {
        let next = new Date(Math.floor(Date.now() + CONF.ping * 1000)).toString();
        if (err !== 0 || res === null || res.code != 200) {
            print(CONF.dvsc[dIdx].name, msg, err, ". Next check at " + next);
            dIdx++;
            dIdx = dIdx % noFl;
            return;
        }
        let json = JSON.parse(res.body);
        res = null;

        if (!json.isok || !json.data.online) {
            fCnt++;
            print(CONF.dvsc[dIdx].name, "is offline.", "Next check at " + next);
        } else {
            fail = false;
            print(CONF.dvsc[dIdx].name, "is online.", "Next check at " + next);
        }
        json = null;
        print(dIdx === noFl - 1 ? fCnt + " device(s) out of " + noFl + " are offline." : "");

        if (!ok && !fail) {
            print("Device(s) are back online.");
            Scen(CONF.scOn);
            ok = true;
            return;
        }
        if (fCnt >= noFl && !fail) {
            print("All devices are offline.");
            fCnt = 0;
            fail = true;
            ok = false;
            Scen(CONF.scOf);
            return;
        }
        dIdx++;
        dIdx = dIdx % noFl;
        fCnt = dIdx === 0 ? 0 : fCnt;
    });
}

strt();
getK();
print("Starting Shelly Status Alert via Scenes: next check at " + new Date(Math.floor(Date.now() + CONF.ping * 1000)).toString());
Timer.set(CONF.ping * 1000, true, pngD);