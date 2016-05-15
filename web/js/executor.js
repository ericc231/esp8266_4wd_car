var executor = (function () {

    //        var addr = location.hostname;
    var addr = '192.168.2.41';

    var CMD_TIMEOUT = 50;
    var connection;

    var commandInProgress = false;

    var queue = [];

    var timeOutErrorCount = 0;
    var checkResultTimer;

    function checkTimeout() {
        timeOutErrorCount++;
        $("#errorMsg").text("Timeout error, count: " + timeOutErrorCount);
        $("#errorMsg").show();
        // TODO clear queue
        doCheckAndSend(true);
    }

    function checkAndSend() {
        doCheckAndSend(false);
    }

    function doCheckAndSend(tmout) {
        if (!tmout) {
            clearTimeout(checkResultTimer);
        }
        commandInProgress = true;
        var cmd = queue.shift();
        if (cmd != undefined) {
            checkResultTimer = setTimeout(checkTimeout, CMD_TIMEOUT);
            cmd.callback();
        } else {
            commandInProgress = false;
        }
    }

    function waitForSend(callback){
        queue.push({callback: callback});
        if (commandInProgress) {
            return;
        }
        checkAndSend();
    }

    function send(cmd) {
        waitForSend(function() {
            send2(cmd);
        });
    }

    function send2(cmd) {
        if (connection.readyState === 1) {
            connection.send(cmd);
        }
    }

    // Make the function wait until the connection is made...
    function waitForSocketConnection(socket, callback){
        setTimeout(
            function () {
                if (socket.readyState === 1) {
                    console.log("Connection is made")
                    if(callback != null){
                        callback();
                    }
                    return;

                } else {
                    //console.log("wait for connection...");
                    waitForSocketConnection(socket, callback);
                }

            }, 5); // wait 5 milisecond for the connection...
    }

    function initWebsocket(onMsg) {
        connection = new ReconnectingWebSocket('ws://' + addr + ':81/', null,
            {
                binaryType: "arraybuffer",
                debug: true
            });
        connection.onopen = function () {
            //connection.send('Connect ' + new Date());
        };
        connection.onerror = function (error) {
            console.log('WebSocket Error ', error);
        };
        connection.onmessage = function (e) {
//        console.log('Server: ', e.data);
            onMsg(e);
            checkAndSend();
        };


    }

    function startJob(callback) {
        waitForSocketConnection(connection, callback);
    }

    var init = function (onMsg) {
        initWebsocket(onMsg);
    };

    return {
        init: init,
        send: send,
        startJob: startJob
    };

})();