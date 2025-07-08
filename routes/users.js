var express = require('express');
var router = express.Router();

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { wss } = require('../app');
const webSocket = require("../bin/wsServer");

const dbPath = path.join(__dirname, './database/auction.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {console.error('db connect failed', err);}
  else {console.log('db connect successfully');}
})

// create user database table
db.run(`CREATE TABLE IF NOT EXISTS user (
    nickname TEXT not null,
    line TEXT,
    tier TEXT,
    champ TEXT,
    leader_count INTEGER DEFAULT 0,
    participant_count INTEGER DEFAULT 0,
    win_count INTEGER DEFAULT 0
)`, (err) => {
  if (err) {console.error('user table connect failed', err.message);}
  else {console.log('user table connect successfully');}
})

//get player data
router.get('/', function(req, res, next) {
  db.all(`SELECT * FROM user
              ORDER BY nickname ASC, CASE line
                WHEN 'TOP' THEN 1
                WHEN 'JUG' THEN 2
                WHEN 'MID' THEN 3
                WHEN 'ADC' THEN 4
                WHEN 'SUO' THEN 5
                ELSE 6
              END ASC`, [], (err, rows) => {
    if (err) {
      console.error('user table search failed', err.message);
      return res.status(500).json({error:'table search fail'})
    }

    const result = {};
    rows.forEach(row => {
      if (!result[row.nickname]) {
        result[row.nickname] = {};
      }

      result[row.nickname][row.line] = {
        tier: row.tier,
        champ: row.champ
      }
    })

    res.json(result)
  })
});

//add player data
router.post('/add', function(req, res, next) {
  const {nickname, line, tier, champ} = req.body;

  if (!nickname || !line || !tier || !champ ) {
    return res.status(400).json({error: 'check field please'})
  }

  db.run(
      `INSERT INTO user (nickname, line, tier, champ) VALUES (?, ?, ?, ?)`,
      [nickname, line, tier, champ],
      function(err){
        if (err) {
          console.log('failed to add user data : ', err.message)
          return res.status(500).json({error: 'failed to insert data'})
        }

          webSocket.broadcast('USER_UPDATE')

        console.log(`successfully added user data in ${this.lastID}`);
        res.json({message: 'success', id:this.lastID})
      }
  )
})

//delete player data
router.delete('/delete', function(req, res, next) {
  const {nickname, line} = req.body

  if (!nickname || !line) {
    return res.status(400).json({error: 'please check field'})
  }

  db.run(
      `DELETE FROM user WHERE nickname=? AND line=?`,
      [nickname, line],
      function(err){
        if(err) {
          console.error('failed to delete user data : ', err.message)
          return res.status(500).json({error: 'failed to delete'})
        }

        if(this.changes === 0){
          return res.status(404).json({error: 'not exist data to delete'})
        }

        webSocket.broadcast('USER_UPDATE')

        console.log(`success to delete user data : ${nickname}, ${line}`)
        res.json({message: 'success'})
      }
  )
})

// update champ
router.put('/update/champ', function (req, res, next) {
    const { nickname, line, champ } = req.body;

    if (!nickname || !line || champ === undefined) {
        return res.status(400).json({ error: 'please check field' });
    }

    db.run(
        'UPDATE user SET champ=? WHERE nickname=? AND line=?',
        [champ, nickname, line],
        function (err) {
            if (err) {
                console.error('failed to update champ: ', err.message);
                return res.status(500).json({ error: 'failed to update champ' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'not exist data to update' });
            }

            webSocket.broadcast('USER_UPDATE')

            console.log(`successfully updated champ for ${nickname}, ${line}`);
            res.json({ message: 'success' });
        }
    );
});

// update tier
router.put('/update/tier', function (req, res, next) {
    const { nickname, line, tier } = req.body;

    if (!nickname || !line || !tier) {
        return res.status(400).json({ error: 'please check field' });
    }

    db.run(
        'UPDATE user SET tier=? WHERE nickname=? AND line=?',
        [tier, nickname, line],
        function (err) {
            if (err) {
                console.error('failed to update tier: ', err.message);
                return res.status(500).json({ error: 'failed to update tier' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'not exist data to update' });
            }

            webSocket.broadcast('USER_UPDATE')

            console.log(`successfully updated tier for ${nickname}, ${line}`);
            res.json({ message: 'success' });
        }
    );
});

module.exports = router;
