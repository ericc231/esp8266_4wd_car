var main = (function (executor) {

    var SENSOR_POLL = 500;
    var MOTOR_POLL = 20;
    var joystick;
    var pingStart;
    var sensorStart;
    var motorStart;
    var moving;

    function sendPing() {
        $("#pingTime").text('');
        pingStart = new Date().getTime();
        var ba = new Uint8Array(1);
        ba[0] = 0x0A;
        executor.send(ba);
    }

    var pollSensors = function () {
        sendSensor();
    };

    var pollMotor = function () {
        var coord = calc();
        var cmd = buildCmd(coord);
        $("#result").text(cmd);
        motorStart = new Date().getTime();
        executor.send(cmd.buffer);
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
        var ba = new Uint8Array(1);
        ba[0] = 0x0B;
        executor.send(ba);
    }

    function displaySensor(bytearray) {
        var uptime = (bytearray[1] << 16) | (bytearray[2] << 8) | bytearray[3];
        var amp = (bytearray[4] << 8) | bytearray[5];
        var volt = (bytearray[6] << 8) | bytearray[7];

        $("#uptime").text(uptime);

        var AMP_OFFSET = 2500;
        var BATT_AMP_VOLTS_PER_AMP = 66;
        var aaa = ((((amp / 1024.0) * 5000) - AMP_OFFSET) / BATT_AMP_VOLTS_PER_AMP);

        $("#amp").text(aaa);
        $("#volt").text((47 + 10) * volt * 5 / (1024 * 10));

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
        executor.send(ba);
    }

    function runB(num) {
        var ba = buildCmd1Wheel(num, 2, 255);
        executor.send(ba);
    }

    function stopWheel(num) {
        var ba = buildCmd1Wheel(num, 3, 255);
        executor.send(ba);
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

    function onMsg(event) {
        var bytearray = new Uint8Array(event.data);
        if (bytearray[0] == 0x0A) {
            displayPong();
        } else if (bytearray[0] == 0x0B && bytearray.length == 8) {
            displaySensor(bytearray)
        } else if (bytearray[0] == 0x0C) {
            onReplyMotor();
        }
    }

    function docReady() {
        console.log("ready!");
        executor.init(onMsg);
        executor.startJob(pollSensors)
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

})(executor);