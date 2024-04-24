const express = require('express')
const app = express()
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
let db = null
let filePath = path.join(__dirname, 'twitterClone.db')
app.use(express.json())
const initialize = async () => {
  db = await open({
    filename: filePath,
    driver: sqlite3.Database,
  })
  app.listen(3000, () => {
    console.log('App is running at port 3000')
  })
}

initialize()

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const query = `select * from user where username='${username}'`
  const ans = await db.get(query)
  if (ans !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else if (password.length < 6) {
    response.status(400)
    response.send('Password is too short')
  } else {
    const newpass = bcrypt.hash(password, 10)
    const query = `insert into user(username,password,name,gender) values('${username}','${newpass}','${name}','${gender}')`
    await db.run(query)
    response.status(200)
    response.send('User created successfully')
  }
})

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const query = `select * from user where username='${username}'`
  const ans = await db.get(query)
  if (ans === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const compare = await bcrypt.compare(password, ans.password)
    if (compare === true) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'SECRET')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

const toAuthenticate = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'SECRET', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

app.get('/user/tweets/feed/', toAuthenticate, async (request, response) => {
  const {username} = request
  const query = `select user_id from user where username='${username}'`
  const ans = await db.get(query)
  const {user_id} = ans
  const getFeedQuery = `
      SELECT u.username AS username, t.tweet, t.date_time AS dateTime
      FROM tweet t
      JOIN follower f ON t.user_id = f.following_user_id
      JOIN user u ON t.user_id = u.user_id
      WHERE f.follower_user_id = ${user_id}
      ORDER BY t.date_time DESC
      LIMIT 4;
    `
  const ans1 = await db.all(getFeedQuery)
  response.send(ans1)
})

app.get('/user/following/', toAuthenticate, async (request, response) => {
  const {username} = request
  const query = `SELECT u.name AS name
      FROM user u
      JOIN follower f ON u.user_id = f.following_user_id
      JOIN user u_followed ON f.follower_user_id = u_followed.user_id
      WHERE u_followed.username = '${username}'`
  const ans = await db.all(query)
  response.send(ans)
})

app.get('/user/followers/', toAuthenticate, async (request, response) => {
  const {username} = request
  const query = `SELECT u.name AS name
        FROM user u
        JOIN follower f ON u.user_id = f.follower_user_id
        JOIN user u_following ON f.following_user_id = u_following.user_id
        WHERE u_following.username = '${username}'`
  const ans = await db.all(query)
  response.send(ans)
})

app.get('/tweets/:tweetId/', toAuthenticate, async (request, response) => {
  const {tweetId} = request.params
  const {username} = request
  const query1 = `select user_id from user where username='${username}'`
  const userid = await db.get(query1)
  const {user_id} = userid
  const tweetquery = `SELECT
    t.tweet,
    COUNT(l.like_id) AS likes,
    COUNT(r.reply_id) AS replies,
    t.date_time AS dateTime
      FROM tweet t
      LEFT JOIN like l ON t.tweet_id = l.tweet_id
      LEFT JOIN reply r ON t.tweet_id = r.tweet_id
      WHERE t.tweet_id = ${tweetId}
      GROUP BY t.tweet_id;
`
  const mainans = await db.get(tweetquery)
  const x = `select user_id from tweet where tweet_id=${tweetId}`
  const ans9 = await db.get(x)
  const user2 = ans9.user_id

  const isFollQuery = `SELECT COUNT(*) AS isFollowing
    FROM follower
    WHERE follower_user_id = ${user_id} AND following_user_id = ${user2};
`

  const ans4 = await db.get(isFollQuery)
  if (ans4.isFollowing > 0) {
    response.send(mainans)
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

app.delete('/tweets/:tweetId/', toAuthenticate, async (request, response) => {
  const {tweetId} = request.params
  const {username} = request
  const query = `select user_id from user where username='${username}'`
  const ans = await db.get(query)
  const {user_id} = ans
  const deletequery = `delete from tweet where tweet_id=${tweetId} and user_id=${user_id}`
  const ans1 = await db.run(deletequery)
  if (ans1.changes > 0) {
    response.status(200).send('Tweet Removed')
  } else {
    response.status(401).send('Invalid Request')
  }
})

app.post('/user/tweets/', toAuthenticate, async (request, response) => {
  const {tweet} = request.body
  const {username} = request
  const query = `select user_id from user where username='${username}'`
  const ans = await db.get(query)
  const {user_id} = ans
  const insert = `insert into tweet (user_id, tweet, date_time)
      VALUES (${user_id}, '${tweet}', DATETIME('now'))`
  await db.run(insert)
  response.send('Created a Tweet')
})

app.get('/user/tweets/', toAuthenticate, async (request, response) => {
  const {username} = request
  const query = `select user_id from user where username='${username}'`
  const ans = await db.get(query)
  const {user_id} = ans
  const getTweetsQuery = `
      SELECT
        t.tweet,
        COUNT(l.like_id) AS likes,
        COUNT(r.reply_id) AS replies,
        t.date_time AS dateTime
      FROM tweet t
      LEFT JOIN like l ON t.tweet_id = l.tweet_id
      LEFT JOIN reply r ON t.tweet_id = r.tweet_id
      WHERE t.user_id = ${user_id}
      GROUP BY t.tweet_id;
    `

  const tweets = await db.all(getTweetsQuery)
  response.send(tweets)
})

app.get(
  '/tweets/:tweetId/replies/',
  toAuthenticate,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const query = `select user_id from user where username='${username}'`
    const ans = await db.get(query)
    const {user_id} = ans

    const isFollowingQuery = `
      SELECT COUNT(*) AS isFollowing
      FROM follower
      WHERE follower_user_id = ${user_id} AND following_user_id = (
        SELECT user_id
        FROM tweet
        WHERE tweet_id = ${tweetId}
      );
    `

    const isFollow = await db.get(isFollowingQuery)
    if (!isFollow || isFollow.isFollowing === 0) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const getRepliesQuery = `
      SELECT u.name, r.reply
      FROM reply r
      JOIN user u ON r.user_id = u.user_id
      WHERE r.tweet_id = ${tweetId};
    `

      const replies = await db.all(getRepliesQuery)

      response.send({replies: replies})
    }
  },
)

app.get(
  '/tweets/:tweetId/likes/',
  toAuthenticate,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const query = `select user_id from user where username='${username}'`
    const ans = await db.get(query)
    const {user_id} = ans

    const isFollowingQuery = `
      SELECT COUNT(*) AS isFollowing
      FROM follower
      WHERE follower_user_id = ${user_id} AND following_user_id = (
        SELECT user_id
        FROM tweet
        WHERE tweet_id = ${tweetId}
      );
    `

    const {isFollowing} = await db.get(isFollowingQuery)
    if (isFollowing === 0) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const getLikesQuery = `
      SELECT u.username AS username
      FROM like l
      JOIN user u ON l.user_id = u.user_id
      WHERE l.tweet_id = ${tweetId};
    `

      const likes = await db.all(getLikesQuery)
      const final = []
      for (let x of likes) {
        final.push(x.username)
      }
      response.send({likes: final})
    }
  },
)
module.exports = app
