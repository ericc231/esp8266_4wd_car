var main = (function () {

    //        var addr = location.hostname;
    var addr = '192.168.2.41';

    var SENSOR_POLL = 4;
    var MOTOR_POLL = 4;
    var CMD_TIMEOUT = 50;
    var connection;
    var joystick;
    var pingStart;
    var sensorStart;
    var motorStart;
    var moving;
    var commandInProgress = false;

    var queue = [];

    var timeOutErrorCount = 0;
    var checkResultTimer;

    function checkTimeout() {
        timeOutErrorCount++;
        $("#errorMsg").text("Timeout error, count: " + timeOutErrorCount);
        $("#errorMsg").show();
        checkAndSend();
    }

    function checkAndSend() {
        clearTimeout(checkResultTimer);
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

    function sendPing() {
        $("#pingTime").text('');
        pingStart = new Date().getTime();
        waitForSend(function() {
            var ba = new Uint8Array(1);
            ba[0] = 0x0A;
            send2(ba);
        });
    }

    var pollSensors = function () {
        sendSensor();
    };

    var pollMotor = function () {
        var coord = calc();
        var cmd = buildCmd(coord);
        $("#result").text(cmd);
        motorStart = new Date().getTime();
        waitForSend(function() {
            send2(cmd.buffer);
        });
    };

    function onReplyMotor() {
        var endTime = new Date().getTime();
        var latency = endTime - motorStart;
        //updateLatency(latency);
        var nextRun = MOTOR_POLL - latency;
        if (nextRun < 0) {
            nextRun = 0;
        }
        if (!moving) {
            return;
        }
        // TODO clear
        setTimeout(pollMotor, nextRun);

        $("#motorLatency").text(latency);
    }

    function sendSensor() {
        sensorStart = new Date().getTime();
        waitForSend(function() {
            var ba = new Uint8Array(1);
            ba[0] = 0x0B;
            send2(ba);
        });
    }

    function displaySensor(bytearray) {
        var uptime = (bytearray[1] << 16) | (bytearray[2] << 8) | bytearray[3];
        var amp = (bytearray[4] << 8) | bytearray[5];
        var volt = (bytearray[6] << 8) | bytearray[7];

        $("#uptime").text(uptime);
        $("#amp").text(amp);
        $("#volt").text(volt);

        var endTime = new Date().getTime();
        var latency = endTime - sensorStart;
        //updateLatency(latency);
        var nextRun = SENSOR_POLL - latency;
        if (nextRun < 0) {
            nextRun = 0;
        }
        setTimeout(pollSensors, nextRun);

        $("#sensorLatency").text(latency);
    }

    function displayPong() {
        var end = new Date().getTime();
        var time = end - pingStart;
        $("#pingTime").text(time);
    }

    function runF(num) {
        var ba = buildCmd1Wheel(num, 1, 255);
        waitForSend(function() {
            send2(ba);
        });
    }

    function runB(num) {
        var ba = buildCmd1Wheel(num, 2, 255);
        waitForSend(function() {
            send2(ba);
        });
    }

    function stopWheel(num) {
        var ba = buildCmd1Wheel(num, 3, 255);
        waitForSend(function() {
            send2(ba);
        });
    }

    function send2(cmd) {
        if (connection.readyState === 1) {
            connection.send(cmd);
        }
    }

    var sc45 = sinDegrees(45);
    var R1 = 100;
    var R2 = R1 * sc45;

    function buildCmd(coord) {
        var x = coord.x;
        var y = coord.y;
        if (y > R2 && Math.abs(x) <= y) {
            x = R2 * x / y;
            y = R2;
        } else if (x > R2 && Math.abs(y) <= x) {
            y = R2 * y / x;
            x = R2;
        } else if (y < -R2 && Math.abs(x) <= -y) {
            x = -R2 * x / y;
            y = -R2;
        } else if (x < -R2 && Math.abs(y) <= -x) {
            y = -R2 * y / x;
            x = -R2;
        }

        x = x * 255 / R2;
        y = y * 255 / R2;

        //var l = getDirAndSpeed(Math.round(x));
        //var r = getDirAndSpeed(Math.round(y));
        //return '#' + l.d + l.s + r.d + r.s;
        var bytearray = buildCmdAllWheels(x, y);
        return bytearray;
    }

    function buildCmdAllWheels(x, y) {
        var bytearray = new Uint8Array(5);
        bytearray[0] = 0x0C;
        bytearray[1] = getDir(x);
        bytearray[2] = getSpeed(x);
        bytearray[3] = getDir(y);
        bytearray[4] = getSpeed(y);
        return bytearray;
    }

    function buildCmd1Wheel(wheel, dir, speed) {
        var ba = new Uint8Array(4);
        ba[0] = 0x0D;
        ba[1] = wheel;
        ba[2] = dir;
        ba[3] = speed;
        return ba;
    }

    function getDir(c) {
        return c >= 0 ? 1 : 2;
    }

    function getSpeed(c) {
        if (c < 0) {
            c = -c;
        }
        return c;
    }

    function pad(num) {
        var s = "00" + num;
        return s.substr(s.length - 3);
    }

    function calc() {
        var x = joystick.deltaX();
        var y = -joystick.deltaY();
        var x1 = sc45 * (x + y);
        var y1 = sc45 * (-x + y);
        return {x: x1, y: y1};
    }

    function sinDegrees(angle) {
        return Math.sin(angle / 180 * Math.PI);
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
                    console.log("wait for connection...")
                    waitForSocketConnection(socket, callback);
                }

            }, 5); // wait 5 milisecond for the connection...
    }

    function initWebsocket() {
        connection = new WebSocket('ws://' + addr + ':81/', ['arduino']);
        connection.binaryType = "arraybuffer";
        connection.onopen = function () {
            //connection.send('Connect ' + new Date());
        };
        connection.onerror = function (error) {
            console.log('WebSocket Error ', error);
        };
        connection.onmessage = function (e) {
//        console.log('Server: ', e.data);
            var bytearray = new Uint8Array(event.data);
            if (bytearray[0] == 0x0A) {
                displayPong();
            } else if (bytearray[0] == 0x0B && bytearray.length == 8) {
                displaySensor(bytearray)
            } else if (bytearray[0] == 0x0C) {
                onReplyMotor();
            }
            checkAndSend();
        };

        waitForSocketConnection(connection, pollSensors);
    }

    function initJoystick() {
        console.log("touchscreen is", VirtualJoystick.touchScreenAvailable() ? "available" : "not available");

        joystick = new VirtualJoystick({
            container: document.getElementById('container'),
            mouseSupport: true,
            limitStickTravel: true,
            stickRadius: 100,
            stationaryBase: true,
            baseX: 150,
            baseY: 150,
        });
        joystick.addEventListener('touchStart', function () {
            moving = true;
            // TODO
            setTimeout(pollMotor, 0);
            console.log('down')
        });
        joystick.addEventListener('touchEnd', function () {
            moving = false;
            console.log('up')
        });
    }

    function initWheels() {
        $(".wheelControlF").click(function () {
            var wnum = $(this).parent(".wheelControl").data("wnum");
            runF(parseInt(wnum));
        });
        $(".wheelControlB").click(function () {
            var wnum = $(this).parent(".wheelControl").data("wnum");
            runB(parseInt(wnum));
        });
        $(".wheelControlS").click(function () {
            var wnum = $(this).parent(".wheelControl").data("wnum");
            stopWheel(parseInt(wnum));
        });
    }

    function docReady() {
        console.log("ready!");
        initWebsocket();
        initJoystick();
        initWheels();
        $("#pingBtn").click(function () {
            sendPing();
        });
    }

    var init = function () {
        $(document).ready(docReady);
    };

    return {
        init: init
    };

})();