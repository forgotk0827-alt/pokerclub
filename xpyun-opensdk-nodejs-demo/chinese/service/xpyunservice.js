httpclient = require('./httpclient.js');

const BASE_URL = "https://open.xpyun.net/api/openapi";

var service = function () {

}

function xpyunPostJson(url, json) {
    // let result = await httpclient.httpPostJson(url, json);

    return httpclient.httpPostJson(url, json);
}

/**
 * 1.批量添加打印机
 * @param restRequest
 * @return
 */
function xpYunAddPrinters(restRequest) {
    let url = BASE_URL + "/xprinter/addPrinters";
    let json = {
        "user": restRequest.user,
        "userKey": restRequest.userKey,
        "sign": restRequest.sign,
        "debug": restRequest.debug,
        "timestamp": restRequest.timestamp,
        "items": restRequest.items,
    }
    return xpyunPostJson(url, json);
}

/**
 * 2.设置打印机语音类型
 * @param restRequest
 * @return
 */
function xpYunSetVoiceType(restRequest) {
    let url = BASE_URL + "/xprinter/setVoiceType";
    let json = {
        "user": restRequest.user,
        "userKey": restRequest.userKey,
        "sn": restRequest.sn,
        "sign": restRequest.sign,
        "debug": restRequest.debug,
        "timestamp": restRequest.timestamp,
        "voiceType": restRequest.voiceType,
    }

    return xpyunPostJson(url, json);
}

/**
 * 3.打印小票订单
 * @param restRequest - 打印订单信息
 * @return
 */
function xpYunPrint(restRequest) {
    let url = BASE_URL + "/xprinter/print";
    let json = {
        "user": restRequest.user,
        "userKey": restRequest.userKey,
        "sn": restRequest.sn,
        "sign": restRequest.sign,
        "debug": restRequest.debug,
        "timestamp": restRequest.timestamp,
        "content": restRequest.content,
        "mode": restRequest.mode,
        "copies": restRequest.copies,
        "voice": restRequest.voice,
    }

    return xpyunPostJson(url, json);
}

/**
 * 3.打印小票订单  支持金额播报
 * @param restRequest - 打印订单信息
 * @return
 */
function xpYunPrintVoiceSupport(restRequest) {
    let url = BASE_URL + "/xprinter/print";
    let json = {
        "user": restRequest.user,
        "userKey": restRequest.userKey,
        "sn": restRequest.sn,
        "sign": restRequest.sign,
        "debug": restRequest.debug,
        "timestamp": restRequest.timestamp,
        "content": restRequest.content,
        "mode": restRequest.mode,
        "copies": restRequest.copies,
        "voice": restRequest.voice,
        "payType": restRequest.payType,
        "payMode": restRequest.payMode,
        "money": restRequest.money,
    }

    return xpyunPostJson(url, json);
}

/**
 * 4.打印标签订单
 * @param restRequest - 打印订单信息
 * @return
 */
function xpYunPrintLabel(restRequest) {
    let url = BASE_URL + "/xprinter/printLabel";

    let json = {
        "user": restRequest.user,
        "userKey": restRequest.userKey,
        "sn": restRequest.sn,
        "sign": restRequest.sign,
        "debug": restRequest.debug,
        "timestamp": restRequest.timestamp,
        "content": restRequest.content,
        "mode": restRequest.mode,
        "copies": restRequest.copies,
        "voice": restRequest.voice,
    }

    return xpyunPostJson(url, json);
}

/**
 * 5.批量删除打印机
 * @param restRequest
 * @return
 */
function xpYunDelPrinters(restRequest) {
    let url = BASE_URL + "/xprinter/delPrinters";
    let json = {
        "user": restRequest.user,
        "userKey": restRequest.userKey,
        "snlist": restRequest.snlist,
        "sign": restRequest.sign,
        "debug": restRequest.debug,
        "timestamp": restRequest.timestamp
    }
    return xpyunPostJson(url, json);
}


/**
 * 6.修改打印机信息
 * @param restRequest
 * @return
 */
function xpYunUpdatePrinter(restRequest) {
    let url = BASE_URL + "/xprinter/updPrinter";
    let json = {
        "user": restRequest.user,
        "userKey": restRequest.userKey,
        "sn": restRequest.sn,
        "name": restRequest.name,
        "cardno": restRequest.cardno,
        "idcode": restRequest.idcode,
        "sign": restRequest.sign,
        "debug": restRequest.debug,
        "timestamp": restRequest.timestamp
    }

    return xpyunPostJson(url, json);
}

/**
 * 7.清空待打印队列
 * @param restRequest
 * @return
 */
function xpYunDelPrinterQueue(restRequest) {
    let url = BASE_URL + "/xprinter/delPrinterQueue";
    let json = {
        "user": restRequest.user,
        "userKey": restRequest.userKey,
        "sn": restRequest.sn,
        "sign": restRequest.sign,
        "debug": restRequest.debug,
        "timestamp": restRequest.timestamp
    }

    return xpyunPostJson(url, json);
}

/**
 * 8.查询订单是否打印成功
 * @param restRequest
 * @return
 */
function xpYunQueryOrderState(restRequest) {
    url = BASE_URL + "/xprinter/queryOrderState";
    let json = {
        "user": restRequest.user,
        "userKey": restRequest.userKey,
        "sn": restRequest.sn,
        "sign": restRequest.sign,
        "debug": restRequest.debug,
        "orderId": restRequest.orderId,
        "timestamp": restRequest.timestamp
    }

    return xpyunPostJson(url, json);
}

/**
 * 9.查询打印机某天的订单统计数
 * @param restRequest
 * @return
 */
function xpYunQueryOrderStatis(restRequest) {
    let url = BASE_URL + "/xprinter/queryOrderStatis";

    let json = {
        "user": restRequest.user,
        "userKey": restRequest.userKey,
        "sn": restRequest.sn,
        "sign": restRequest.sign,
        "debug": restRequest.debug,
        "date": restRequest.date,
        "timestamp": restRequest.timestamp
    }

    return xpyunPostJson(url, json);
}

/**
 * 10.查询打印机状态
 *
 * 0、离线 1、在线正常 2、在线不正常
 * 备注：异常一般是无纸，离线的判断是打印机与服务器失去联系超过30秒
 * @param restRequest
 * @return
 */
function xpYunQueryPrinterStatus(restRequest) {
    let url = BASE_URL + "/xprinter/queryPrinterStatus";
    let json = {
        "user": restRequest.user,
        "userKey": restRequest.userKey,
        "sn": restRequest.sn,
        "sign": restRequest.sign,
        "debug": restRequest.debug,
        "timestamp": restRequest.timestamp
    }

    return xpyunPostJson(url, json);
}

/**
 * 10.批量查询打印机状态
 *
 * 0、离线 1、在线正常 2、在线不正常
 * 备注：异常一般是无纸，离线的判断是打印机与服务器失去联系超过30秒
 * @param restRequest
 * @return
 */
function xpYunQueryPrintersStatus(restRequest) {
    let url = BASE_URL + "/xprinter/queryPrintersStatus";
    let json = {
        "user": restRequest.user,
        "userKey": restRequest.userKey,
        "sn": restRequest.sn,
        "sign": restRequest.sign,
        "debug": restRequest.debug,
        "timestamp": restRequest.timestamp
    }

    return xpyunPostJson(url, json);
}

/**
 * 11.云喇叭播放语音
 * @param restRequest - 播放语音信息
 * @return
 */
function xpYunPlayVoice(restRequest) {
    let url = BASE_URL + "/xprinter/playVoice";
    let json = {
        "user": restRequest.user,
        "userKey": restRequest.userKey,
        "sn": restRequest.sn,
        "payType": restRequest.payType,
        "payMode": restRequest.payMode,
        "money": restRequest.money,
        "sign": restRequest.sign,
        "debug": restRequest.debug,
        "timestamp": restRequest.timestamp
    }

    return xpyunPostJson(url, json);
}

/**
 * 12.POS指令
 * @param restRequest - POS指令信息
 * @return
 */
function xpYunPos(restRequest) {
    let url = BASE_URL + "/xprinter/pos";

    let json = {
        "user": restRequest.user,
        "userKey": restRequest.userKey,
        "sn": restRequest.sn,
        "sign": restRequest.sign,
        "debug": restRequest.debug,
        "timestamp": restRequest.timestamp,
        "content": restRequest.content,
    }

    return xpyunPostJson(url, json);
}

/**
 * 13.钱箱控制
 * @param restRequest - 钱箱控制信息
 * @return
 */
function xpYunControlBox(restRequest) {
    let url = BASE_URL + "/xprinter/controlBox";

    let json = {
        "user": restRequest.user,
        "userKey": restRequest.userKey,
        "sn": restRequest.sn,
        "sign": restRequest.sign,
        "debug": restRequest.debug,
        "timestamp": restRequest.timestamp,
        "content": restRequest.content,
    }

    return xpyunPostJson(url, json);
}

module.exports = {
    xpYunAddPrinters,
    xpYunSetVoiceType,
    xpYunDelPrinters,
    xpYunUpdatePrinter,
    xpYunDelPrinterQueue,
    xpYunQueryOrderState,
    xpYunQueryOrderStatis,
    xpYunQueryPrinterStatus,
    xpYunPlayVoice,
    xpYunPrint,
    xpYunPrintVoiceSupport,
    xpYunPrintLabel,
    xpYunQueryPrintersStatus,
    xpYunPos,
    xpYunControlBox
};