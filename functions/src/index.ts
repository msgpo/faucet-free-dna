import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as requestify from 'requestify'
import * as rq from 'request-promise'
var { Apis, ChainConfig } = require("bitsharesjs-ws");
var { ops, PrivateKey, PublicKey, Signature, key, ChainStore, TransactionHelper, TransactionBuilder, Aes } = require('bitsharesjs');

const { timeStamp } = require("console");

import { Apis, ChainConfig } from "bitsharesjs-ws";

let wsUri = 'wss://testnet.mvsdna.info/ws';
ChainConfig.networks['DNA_NEST'] = {
    core_asset: 'DNA',
    address_prefix: 'DNA',
    chain_id: '19969b8cd3c7f00520722c08f97cebe80bb4443098e76726119c767d59354333',
};
ChainConfig.setChainId("19969b8cd3c7f00520722c08f97cebe80bb4443098e76726119c767d59354333");

ChainConfig.setPrefix("DNA");
let core_asset_id = '1.3.0';
let TOKEN_SYMBOL = "DNA";


export const wsApi = {
    _initedInstance: false,
    _initedSubscribe: false,
    _initedChainstore: false,
    _handlers: {},
    init() {
        let that = this;

        Apis.setRpcConnectionStatusCallback(function (status) {
            if (status == "closed") {
                //停止了
                setTimeout(() => {
                    that.init();
                }, 5 * 1000);
            }
            // console.log("connection status callback:" + status);
        });

        Apis.instance(wsUri, true).init_promise.then((res) => {
            that._initedInstance = true;
            console.log("ws api connected");
            //console.log("connected to:", res[0].network);

            // 初始化订阅
            Apis.instance().db_api().exec("set_subscribe_callback", [function (objects) {
                //console.log("subscribe callbacked");
                that.updateListener(objects)
            }, false]).then((data) => {
                console.log("ws api subscribed");
                that._initedSubscribe = true;
            }).catch(function (err) {
                console.log("ws api subscribed error");
                console.log(JSON.stringify(err));
            })

            // TODO:初始化Chainstore导致回调失败
            that._initedChainstore = true;
            // 初始化Chainstore
            // ChainStore.init(false).then((data) => {
            //     that._initedChainstore = true;
            // })
        })
    },
    async instance(wSub = false, wChain = false) {
        await this.waitForInstance();
        if (wSub) {
            await this.waitForSubscribe();
        }
        if (wChain) {
            await this.waitForChainstore();
        }
        return Apis.instance();
    },
    async waitForInstance() {
        return this._waitFor("_initedInstance")
    },
    async waitForSubscribe() {
        return this._waitFor("_initedSubscribe")
    },
    async waitForChainstore() {
        return this._waitFor("_initedChainstore")
    },
    async _waitFor(boolKey){
        let that = this;
        return new Promise((resolve, reject):any => {
            (function iterator() {
                if (that[boolKey]) {
                    resolve(true);
                }
                setTimeout(() => {
                    iterator();
                }, 300);
            })();
        })
    },
    /**
     * 添加对Object的监听函数
     * 1、根据object id完全匹配监听
     * 如:id=2.5.10
     * 
     * 2、根据object id通配符匹配监听
     * 如：id=2.5.*
     * 监听到相关object，主动新增一个完全匹配监听
     * 
     * 3、根据object id通配符和object条件属性监控
     * 如：id=2.5.*|owner:1.2.36
     * 在object id通配符匹配的前提下，object必须有属性owner并且值等于1.2.36才能匹配
     * 条件可以0个或多个，用｜隔开
     * 监听到相关object，主动新增一个完全匹配监听
     * 
     * @param {*} id 
     * @param {*} handler 
     */
    addHandler(id, handler) {
        this._handlers[id] = handler;
    },
    removeHandler(id) {
        delete this._handlers[id];
    },
    updateListener(rgobjects) {
        //console.log("updateListener:" + objects.length);
        let that = this;
        let objects = rgobjects.flat();
        for (let i = 0; i < objects.length; i++) {
            let obj = objects[i];
            // console.log("updateListener:" + obj.id);
            // console.log("typeof _handlers[obj.id]:" + typeof that._handlers[obj.id]);
            if (that._handlers.hasOwnProperty(obj.id)
                //有完全匹配的
                && typeof that._handlers[obj.id] === "function") {
                that._handlers[obj.id](obj);
            } else {
                //没有完全匹配的，尝试通配符+条件查找
                //如：2.5.*|owner:1.2.36
                //表示：id匹配2.5.*，并且owner属性值为1.2.36的对象
                //|后面为条件，可以是0个或多个
                for (let keyname in that._handlers) {
                    let arr1 = keyname.split("|");
                    let regex = new RegExp(arr1[0]);
                    //id通配符匹配是否通过
                    let pass = regex.test(obj.id);
                    //条件匹配是否通过
                    for (let j = 1; j < arr1.length; j++) {
                        //每个条件必须相等
                        let arr2 = arr1[j].split(":");
                        pass = pass && arr2.length == 2 && obj[arr2[0]] == arr2[1];
                    }
                    if (pass) {
                        //console.log(`regex test success, handlers keyname:${keyname},object id:${JSON.stringify(obj)}`);
                        //执行一次通配符匹配方法回调
                        that._handlers[keyname](obj);
                        //并指定完全匹配方法，下次进入不需要通配符匹配
                        that._handlers[obj.id] = that._handlers[keyname];
                    }
                }
            }
        }
    },
};

wsApi.init()

const ENDPOINT = (functions.config().mvsd) ? functions.config().mvsd.endpoint : "https://testnet.mvsdna.info/rpc"
const RECAPTCHA_SECRET = (functions.config().recaptcha) ? functions.config().recaptcha.secret : ""
const ACCOUNT_NAME = (functions.config().mvsd) ? functions.config().mvsd.account : "user"
const ACCOUNT_AUTH = (functions.config().mvsd) ? functions.config().mvsd.password : "password"
const ETP_AMOUNT = (functions.config().settings) ? parseInt(functions.config().settings.amount) : 200000000
// const SENDGRID = {
//     api: (functions.config().sendgrid) ? functions.config().sendgrid.api : "",
//     template: (functions.config().sendgrid) ? functions.config().sendgrid.template : "",
//     asm: (functions.config().sendgrid) ? functions.config().sendgrid.asm : "", //Unsubscibe list
// }

admin.initializeApp(functions.config().firebase);
const db = admin.firestore()

db.settings({
    timestampsInSnapshots: true
});

async function transfer_(pKey, strfromAccount, strtoAccount, sendAmount, memo) {
    console.log(pKey.toWif());

    let instance = await wsApi.instance(false, false);

    let accounts = await instance.db_api().exec('get_accounts', [[strfromAccount, strtoAccount], false]);
    let fromAccount = accounts.find(it => it.name == strfromAccount);
    let toAccount = accounts.find(it => it.name == strtoAccount);
    let memoFromKey = fromAccount.options.memo_key;
    let memoToKey = toAccount.options.memo_key;
    let assets = await instance.db_api().exec('get_assets', [[sendAmount.asset, ChainConfig.networks['DNA_NEST'].core_asset], false]);
    let sendAsset = assets.find(it => it.symbol == sendAmount.asset);
    let coreAsset = assets.find(it => it.symbol == ChainConfig.networks['DNA_NEST'].core_asset);


    let tr = new TransactionBuilder();
    let transferObj = {
        fee: {
        amount: 0,
        asset_id: coreAsset.id
        },
        from: fromAccount.id,
        to: toAccount.id,
        amount: { amount: sendAmount.amount, asset_id: sendAsset.id },
        memo: null
    };

    if (memo) {
        let nonce = TransactionHelper.unique_nonce_uint64();
        transferObj.memo = {
            from: memoFromKey,
            to: memoToKey,
            nonce,
            message: Aes.encrypt_with_checksum(
                pKey,
                memoToKey,
                nonce,
                memo
            )
        }
    }
    tr.add_type_operation("transfer", transferObj)

    await tr.set_required_fees();
    tr.add_signer(pKey, pKey.toPublicKey().toPublicKeyString());

    let result = await processTranscation(tr)
    console.log("transfer result:");
    console.log(result);
    return result;
}

async function processTranscation(tr): Promise<any> {
    let instance = Apis.instance();
    await tr.finalize();
    tr.sign(instance.chain_id);
    console.log(instance.chain_id)
    if (!tr.tr_buffer) {
        throw new Error("not finalized");
    }
    if (!tr.signatures.length || !tr.signed) {
        throw new Error("not signed");
    }
    if (!tr.operations.length) {
        throw new Error("no operations");
    }
    const tr_object = ops.signed_transaction.toObject(tr);
    console.log(JSON.stringify(tr.serialize()))

    return new Promise((resolve, reject):Promise<any> => {
        return instance.network_api()
            .exec("broadcast_transaction_with_callback", [
                function (res) {
                    resolve(res);
                },
                tr_object,
            ])
            // .then(function (res) {
            //     //console.log('... broadcast success, waiting for callback')
            //     //if (was_broadcast_callback) was_broadcast_callback();
            //     return;
            // })
            .catch(error => {
                // console.log may be redundant for network errors, other errors could occur
                reject(error);
            });
    })
}

/* curl --data '{"jsonrpc": "2.0", "params": ["database", "get_dynamic_global_properties", []], "method": "call", "id": 10}'  https://testnet.mvsdna.info/rpc
{"id":10,"jsonrpc":"2.0","result":{"id":"2.1.0","head_block_number":4414596,"head_block_id":"00435c84874e8587f3507c8a2357e4bfdca3c007","time":"2021-01-21T15:42:45.5","current_witness":"1.6.8","next_maintenance_time":"2021-01-21T15:44:00","last_budget_time":"2021-01-21T15:36:00","witness_budget":980480000,"accounts_registered_this_interval":0,"recently_missed_count":0,"current_aslot":29202427,"recent_slots_filled":"340243424097967060399120364357671684095","dynamic_flags":0,"last_irreversible_block_num":4414532,"last_temp_maintenance_time":"1970-01-01T00:00:00"}} */
export const height = functions.https.onRequest((req, res) => {
    requestify.post(ENDPOINT, {
        jsonrpc: "2.0", 
        params: ["database", "get_dynamic_global_properties", []], 
        method: "call", 
        id: 10
    })
        .then(response => {
            const result = JSON.parse(response.body).result
            res.set('Cache-Control', 'public, max-age=30, s-maxage=30');
            console.log("###height info", result);
            res.json({ height: result.head_block_number })
        })
        .catch(error => {
            res.status(400).json({ message: error.message })
        })
})

/*
 curl --data '{"jsonrpc": "2.0", "params": ["database", "get_account_balances", ["mvs", ["1.3.0"]]], "method": "call", "id": 10}'  https://testnet.mvsdna.info/rpc
{"id":10,"jsonrpc":"2.0","result":[{"amount":"7136644052","asset_id":"1.3.0"}]}
*/
export const balance = functions.https.onRequest((req, res) => {
    requestify.post(ENDPOINT, {
        jsonrpc: "2.0", 
        params: ["database", "get_account_balances", [ACCOUNT_NAME, ["1.3.0"]]], 
        method: "call", 
        id: 11
    })
        .then(response => JSON.parse(response.body))
        .then(response => {
            if (response.error)
                throw Error(response.error.message)
            const result = response.result
            res.set('Cache-Control', 'public, max-age=30, s-maxage=30');
            console.log("###height info", result);
            res.json({ available: result[0].amount})
        })
        .catch(error => {
            res.status(400).json({ message: error.message })
        })
})

export const send = functions.https.onRequest((req, res) => {
    const captcha = req.body.captcha
    const address = req.body.address
    const email: string = req.body.email

    console.log("check recaptcha response", captcha)
    rq.post({
        url: 'https://recaptcha.google.com/recaptcha/api/siteverify',
        form: {
            remoteip: req.connection.remoteAddress,
            secret: RECAPTCHA_SECRET,
            response: captcha
        },
        transform: (response: string) => JSON.parse(response)
    })
        .then(result => {
            if (!result.success) throw Error("Recaptcha verification failed. Are you a robot?")
            return db.collection('transfer').where('address', '==', address).get()
                .then(snapshot => {
                    if (!snapshot.empty) throw Error('Address already in history')
                    return;
                })
        })
        .then(() => _send(address, ETP_AMOUNT))
        .then(tx => {
            res.status(200).json(tx)
            return Promise.all([
                db.collection("transfer").doc().set({
                    address, tx, date: new Date(), hash: tx.hash, amount: ETP_AMOUNT
                }),
                db.collection("user").doc().set({
                    email, address, date: new Date()
                })
            ])
        })
        // .then(() => {
        //     console.info("send mail", SENDGRID.api, SENDGRID.template, SENDGRID.asm)
        //     sgMail.setApiKey(SENDGRID.api);
        //     const msg: MailData = {
        //         from: 'info@mvs.org',
        //         templateId: SENDGRID.template,
        //         personalizations: [
        //             {
        //                 to: email,
        //                 substitutions:{
        //                     address: address
        //                 }

        //             }
        //         ],
        //         asm: {
        //             groupId: parseInt(SENDGRID.asm)
        //         }
        //     }
        //     console.info(msg)
        //     return sgMail.send(msg)
        // })
        .catch(reason => {
            console.log(JSON.stringify(reason))
            if (!res.headersSent)
                res.status(400).send(reason.message)
        })
})

//todo use bitsharesjs
 function _send(address, amount) {
    // return requestify.post(ENDPOINT, {
    //     jsonrpc: "3.0",
    //     method: "send",
    //     params: [ACCOUNT_NAME, ACCOUNT_AUTH, address, amount]
    // })
    //     .then(response => JSON.parse(response.body))
    //     .then(response => {
    //         if (response.error)
    //             throw Error(response.error.message)
    //         console.log(response)
    //         if (response.result.hash)
    //             return response.result
    //         throw Error('Unable to send.')
    //     })
    const pkey = PrivateKey.fromWif(ACCOUNT_AUTH);

    return transfer_(pkey, 
        ACCOUNT_NAME, 
        address,  
        {
            amount: amount,
            asset: "DNA"
        },
        "from free faucet").
        then((transferResult) => {
            const txId = transferResult
                ? transferResult[0].id
                : "";
            const rt = transferResult[0];
            rt.hash = txId;
            return  rt;
        })
}