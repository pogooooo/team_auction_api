var express = require('express');
const path = require("path");
const webSocket = require("../bin/wsServer");
var router = express.Router();
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, './database/auction.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {console.error('db connect failed', err);}
    else {console.log('db connect successfully');}
})

function resetTargetsIfFinished() {
    const entries = Object.entries(targets);

    if (entries.length === 0) return; // 아무것도 없으면 셔플할 필요 없음

    if (currentOrder >= entries.length) {
        currentOrder = 0;

        // Fisher-Yates 셔플
        for (let i = entries.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [entries[i], entries[j]] = [entries[j], entries[i]];
        }

        targets = Object.fromEntries(entries);

        console.log('🔁 타겟 순서가 초기화 및 셔플되었습니다.');
        webSocket.broadcast('TARGET_UPDATE');
        webSocket.broadcast('ORDER_UPDATE');
    }
}

let targets = {}
let currentOrder = 0
let bidderName = {}

//get target list
router.get('/target', function(req, res) {
    res.json(targets);
});

//set target list
router.post('/target', function(req, res) {
    currentOrder = 0
    db.all(
        `SELECT nickname, line, tier, champ, team FROM game WHERE team IS NULL`,
        [],
        (err, rows) => {
            if (err) {
                console.error('Failed to fetch target list:', err.message);
                return res.status(500).json({ error: 'failed to fetch targets' });
            }

            // nickname 기준 객체 생성
            let targetObj = {};
            rows.forEach(row => {
                targetObj[row.nickname] = {
                    line: row.line,
                    tier: row.tier,
                    champ: row.champ
                };
            });

            // 객체 -> 배열로 변환 (랜덤 셔플용)
            let entries = Object.entries(targetObj);

            // 랜덤 셔플 (Fisher-Yates 알고리즘)
            for (let i = entries.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [entries[i], entries[j]] = [entries[j], entries[i]];
            }

            // 다시 객체로 변환
            targets = Object.fromEntries(entries);

            // 변경 메세지
            webSocket.broadcast('TARGET_UPDATE')
            return res.status(200).json({ success: true, targets });
        }
    );
});

//target selling
router.post('/target/sell', function(req, res) {
    const entries = Object.entries(targets);

    if (entries.length === 0) {
        return res.status(400).json({ error: 'No targets to sell' });
    }

    // 첫 번째 항목 제거
    const [removedKey, removedValue] = entries.shift();

    // 다시 객체로 변환
    targets = Object.fromEntries(entries);

    // 데이터 업데이트 메시지 전송
    webSocket.broadcast('TARGET_UPDATE');

    resetTargetsIfFinished();

    res.json({ message: 'Target sold', removed: { [removedKey]: removedValue } });
});

//get order state
router.get('/state', function(req, res) {
    res.json(currentOrder);
})

//set order state
router.post('/state', function(req, res) {
    const { order } = req.body;

    if (typeof order !== 'number' || order < 0) {
        return res.status(400).json({ error: 'invalid order value' });
    }

    currentOrder = order;
    webSocket.broadcast('ORDER_UPDATE');

    resetTargetsIfFinished();

    res.json({ message: 'currentOrder updated', currentOrder });
});

//get bidder name
router.get('/bidder', function(req, res) {
    res.json(bidderName);
});

//set bidder name
router.post('/bidder', function(req, res) {
    const { name, point } = req.body;

    if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'invalid bidder name' });
    }
    if (typeof point !== 'number' || point < 0) {
        return res.status(400).json({ error: 'invalid point value' });
    }

    bidderName = {
        name: name.trim(),
        point: point
    };

    webSocket.broadcast('BIDDER_UPDATE');

    res.json({ message: 'bidder updated', bidder: bidderName });
});

//clear bidder name
router.post('/bidder/clear', function(req, res, next) {
    bidderName = {}
    res.json({message:'bidder clear : ', bidder: bidderName });
    webSocket.broadcast('BIDDER_UPDATE');
})

module.exports = router;
