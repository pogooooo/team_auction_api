var express = require('express');
var router = express.Router();

const bidRouter = require('./bid');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const webSocket = require('../bin/wsServer')
const {use} = require("../app");

const dbPath = path.join(__dirname, './database/auction.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {console.error('db connect failed', err);}
    else {console.log('db connect successfully');}
})

// create game database table
db.run(`CREATE TABLE IF NOT EXISTS game (
    nickname TEXT not null,
    line TEXT,
    tier TEXT,
    champ TEXT,
    leader INTEGER,
    team TEXT
)`, (err) => {
    if (err) {console.error('game table connect failed', err.message);}
    else {console.log('game table connect successfully');}
})

// create leader table
db.run(`CREATE TABLE IF NOT EXISTS leader (
    nickname TEXT NOT NULL PRIMARY KEY,
    point INTEGER DEFAULT 1000
)`, (err) => {
    if (err) {
        console.error('leader table connect failed', err.message);
    } else {
        console.log('leader table connect successfully');
    }
});

router.use('/bid', bidRouter);

//game main
router.get('/', function(req, res, next) {
    res.json({this : 'game page'})
})

//get participant
router.get('/participant', function(req, res, next) {
    db.all(`SELECT * FROM game ORDER BY nickname ASC`, [], (err, rows) => {
        if (err) {
            console.error('game table search failed', err.message)
            return res.status(500).json({error:'table search failed'})
        }

        const result = {}
        rows.forEach(row => {
            result[row.nickname] = {
                line: row.line,
                tier: row.tier,
                champ: row.champ,
                leader: row.leader,
                team: row.team
            }
        })

        res.json(result)
    })
});

//add participant
router.post('/participant/add', function(req, res, next) {
    const {nickname} = req.body

    if(!nickname) {
        return res.status(400).json({error: 'please check field'})
    }

    db.run(
        `INSERT INTO game (nickname, line, tier, champ, leader, team) VALUES (?, null, null, null, 0, null)`,
        [nickname],
        function(err){
            if (err) {
                console.log('failed to add game data : ', err.message)
                return res.status(500).json({error: 'failed to insert data'})
            }

            webSocket.broadcast('PARTICIPANT_UPDATE')

            console.log(`successfully added game data in ${this.lastID}`);
            res.json({message: 'success', id:this.lastID})
        }
    )
})

//delete participant
router.delete('/participant/delete', function(req, res, next) {
    const { nickname } = req.body;

    if (!nickname) {
        return res.status(400).json({ error: 'please provide nickname' });
    }

    db.run(
        `DELETE FROM game WHERE nickname = ?`,
        [nickname],
        function(err) {
            if (err) {
                console.error('failed to delete game data:', err.message);
                return res.status(500).json({ error: 'failed to delete data' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'no data to delete' });
            }

            webSocket.broadcast('PARTICIPANT_UPDATE')

            console.log(`successfully deleted data for nickname=${nickname}`);
            res.json({ message: 'delete success' });
        }
    );
});

//edit line
router.put('/participant/edit/line', function(req, res, next) {
    const { nickname, line } = req.body;

    if (!nickname || !line) {
        return res.status(400).json({ error: 'please provide nickname and line' });
    }

    // 1) user 테이블에서 tier, champ 조회
    db.get(
        `SELECT tier, champ FROM user WHERE nickname = ? AND line = ?`,
        [nickname, line],
        function(err, row) {
            if (err) {
                console.error('user table search failed:', err.message);
                return res.status(500).json({ error: 'failed to search user table' });
            }

            if (!row) {
                return res.status(404).json({ error: 'no matching data in user table' });
            }

            const { tier, champ } = row;

            // 2) game 테이블에 업데이트
            db.run(
                `UPDATE game SET line = ?, tier = ?, champ = ? WHERE nickname = ?`,
                [line, tier, champ, nickname],
                function(err2) {
                    if (err2) {
                        console.error('game table update failed:', err2.message);
                        return res.status(500).json({ error: 'failed to update game table' });
                    }

                    if (this.changes === 0) {
                        return res.status(404).json({ error: 'no data to update in game table' });
                    }

                    webSocket.broadcast('PARTICIPANT_UPDATE')

                    console.log(`successfully updated game data for nickname=${nickname}`);
                    res.json({ message: 'update success', updated: this.changes });
                }
            );
        }
    );
});

//set leader
router.put('/participant/edit/leader', function(req, res, next) {
    const { nickname } = req.body;

    if (!nickname) {
        return res.status(400).json({ error: 'please provide nickname' });
    }

    db.serialize(() => {
        db.run(
            `UPDATE game SET leader = 1 WHERE nickname = ?`,
            [nickname],
            function(err) {
                if (err) {
                    console.error('failed to set leader:', err.message);
                    return res.status(500).json({ error: 'failed to update leader' });
                }

                if (this.changes === 0) {
                    return res.status(404).json({ error: 'no matching data to update' });
                }

                // 리더 테이블에 추가
                db.run(
                    `INSERT OR IGNORE INTO leader (nickname, point) VALUES (?, 1000)`,
                    [nickname],
                    function(err2) {
                        if (err2) {
                            console.error('failed to insert leader:', err2.message);
                            return res.status(500).json({ error: 'failed to insert leader data' });
                        }

                        webSocket.broadcast('PARTICIPANT_UPDATE')
                        webSocket.broadcast('LEADER_UPDATE')

                        console.log(`successfully set leader for nickname=${nickname}`);
                        res.json({ message: 'leader set success', updated: this.changes });
                    }
                );
            }
        );
    });
});

//unset leader
router.put('/participant/edit/unleader', function(req, res, next) {
    const { nickname } = req.body;

    if (!nickname) {
        return res.status(400).json({ error: 'please provide nickname' });
    }

    db.serialize(() => {
        db.run(
            `UPDATE game SET leader = 0 WHERE nickname = ?`,
            [nickname],
            function(err) {
                if (err) {
                    console.error('failed to unset leader:', err.message);
                    return res.status(500).json({ error: 'failed to update leader' });
                }

                if (this.changes === 0) {
                    return res.status(404).json({ error: 'no matching data to update' });
                }

                // 리더 테이블에서 제거
                db.run(
                    `DELETE FROM leader WHERE nickname = ?`,
                    [nickname],
                    function(err2) {
                        if (err2) {
                            console.error('failed to delete leader:', err2.message);
                            return res.status(500).json({ error: 'failed to delete leader' });
                        }

                        webSocket.broadcast('PARTICIPANT_UPDATE')
                        webSocket.broadcast('LEADER_UPDATE')

                        console.log(`successfully unset leader for nickname=${nickname}`);
                        res.json({ message: 'leader unset success', updated: this.changes });
                    }
                );
            }
        );
    });
});

//leader list (leader 테이블에서 포인트까지 조회)
router.get('/participant/leader', function(req, res, next) {
    db.all(
        `SELECT nickname, point FROM leader`,
        [],
        (err, rows) => {
            if (err) {
                console.error('failed to get leader list:', err.message);
                return res.status(500).json({ error: 'failed to retrieve leader list' });
            }

            // 배열로 반환
            const leaders = {};
            rows.forEach(row => {
                leaders[row.nickname] = row.point;
            });

            res.json(leaders);
        }
    );
});

//edit leader point
router.put('/participant/edit/point', function(req, res, next) {
    const { nickname, point } = req.body;

    if (!nickname || typeof point !== 'number') {
        return res.status(400).json({ error: 'please provide valid nickname and point (number)' });
    }

    db.run(
        `UPDATE leader SET point = ? WHERE nickname = ?`,
        [point, nickname],
        function(err) {
            if (err) {
                console.error('failed to update leader point:', err.message);
                return res.status(500).json({ error: 'failed to update point' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'no matching leader to update' });
            }

            webSocket.broadcast('LEADER_UPDATE')

            console.log(`successfully updated point for leader ${nickname} to ${point}`);
            res.json({ message: 'point update success', updated: this.changes });
        }
    );
});

module.exports = router;
