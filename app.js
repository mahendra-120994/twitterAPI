const express = require("express");
const path = require("path");
const app = express();

const bcrypt = require("bcrypt");

const jsonMiddleware = express.json();
app.use(jsonMiddleware);

app.use(express.json());

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Sever Running at http://localhost:3000/");
    });
  } catch (err) {
    console.log(`DB Error: ${err.massage}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const authenticateToken = (req, res, next) => {
  let jwtToken;
  const authHeader = req.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    res.status(401);
    res.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "secret_token", async (error, payload) => {
      if (error) {
        res.status(401);
        res.send("Invalid JWT Token");
      } else {
        req.username = payload.username;
        // res.send(payload);
        next();
      }
    });
  }
};

// Gegister API 1
app.post("/register", async (req, res) => {
  const { username, name, password, gender } = req.body;

  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;

  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    if (password.length < 6) {
      res.status(400);
      res.send("Password is too short");
    } else {
      const encryptedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `
            INSERT INTO user (username, name, password, gender)
            VALUES
            (
                '${username}',
                '${name}',
                '${encryptedPassword}',
                '${gender}'
            )`;
      await db.run(createUserQuery);
      res.status(200);
      res.send("User created successfully");
    }
  } else {
    res.status(400);
    res.send("User already exists");
  }
});

// Login API 2
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;

  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    res.status(400);
    res.send("Invalid user");
  } else {
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password);

    if (isPasswordMatch === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(password, "secret_token");
      res.send({ jwtToken });
    } else {
      res.status(400);
      res.send("Invalid password");
    }
  }
});

// User's Tweets API 3
app.get("/user/tweets/feed/", authenticateToken, async (req, res) => {
  const userTweetsQuery = `SELECT 
    username,
    tweet,
    date_time as dateTime
    FROM
    user JOIN follower ON user.user_id = follower.following_user_id
    JOIN tweet ON tweet.user_id = follower.following_user_id
    WHERE user.username = 'biden@123';
    `;
  const tweets = await db.all(userTweetsQuery);
  res.send(tweets);
});

// User Following AP1 4
app.get("/user/following/", authenticateToken, async (req, res) => {
  let { username } = req;
  const followingUserQuery = `SELECT
      name
      FROM user
      JOIN follower ON user.user_id = follower.following_user_id
      WHERE user.username = 'biden@123';`;

  const followers = await db.all(followingUserQuery);
  res.send(followers);
});

// User Follower AP1 5
app.get("/user/followers/", authenticateToken, async (req, res) => {
  let { username } = req;
  const followerUserQuery = `SELECT
      name
      FROM user
      JOIN follower ON user.user_id = follower.follower_user_id
      WHERE user.username = 'biden@123';`;

  const followings = await db.all(followerUserQuery);
  res.send(followings);
});

// Get Tweets by Id AP1 6
app.get("/tweets/:tweetId/", authenticateToken, async (req, res) => {
  let { tweetId } = req.params;
  const followerUserQuery = `SELECT
      tweet,
      sum(like_id) as likes,
      sum(reply) as replies,
      date_time as dateTime
      FROM user
      JOIN follower ON user.user_id = follower.following_user_id
      JOIN tweet ON tweet.user_id = follower.following_user_id
      JOIN reply ON reply.tweet_id	= tweet.tweet_id
      JOIN like ON like.tweet_id = tweet.tweet_id
      WHERE user.username = 'biden@123';`;

  const followings = await db.get(followerUserQuery);
  res.send(followings);
});

// Get User Names who liked tweet API 7
app.get("/tweets/:tweetId/likes/", authenticateToken, async (req, res) => {
  const userLikedQuery = `SELECT
    name
    FROM user 
    JOIN follower ON user.user_id = follower.following_user_id
    JOIN tweet ON tweet.user_id = follower.following_user_id
    JOIN like ON like.tweet_id = tweet.tweet_id
    WHERE user.username = 'biden@123'
    GROUP by name
    ;`;
  const users = await db.all(userLikedQuery);
  const names = users.map((eachUser) => {
    return eachUser.name;
  });
  res.send({ likes: names });
});

// Get User Names who reply tweet API 8
app.get("/tweets/:tweetId/replies/", authenticateToken, async (req, res) => {
  const userLikedQuery = `SELECT
    name,
    reply
    FROM user 
    JOIN follower ON user.user_id = follower.following_user_id
    JOIN tweet ON tweet.user_id = follower.following_user_id
    JOIN reply ON reply.tweet_id = tweet.tweet_id
    WHERE user.username = 'biden@123'
    GROUP by name
    ;`;
  const replies = await db.all(userLikedQuery);

  res.send({ replies: replies });
});

// Get list of all tweets API 9
app.get("/user/tweets/", authenticateToken, async (req, res) => {
  const followerUserQuery = `SELECT
      tweet,
      sum(like_id) as likes,
      sum(reply) as replies,
      date_time as dateTime
      FROM user
      JOIN follower ON user.user_id = follower.following_user_id
      JOIN tweet ON tweet.user_id = follower.following_user_id
      JOIN reply ON reply.tweet_id	= tweet.tweet_id
      JOIN like ON like.tweet_id = tweet.tweet_id
      WHERE user.username = 'biden@123';`;

  const followings = await db.get(followerUserQuery);
  res.send(followings);
});

// Creat tweet API 10
app.post("/user/tweets/", authenticateToken, async (req, res) => {
  const { tweet } = req.body;
  const creatTweetQuery = `
    INSERT INTO tweet (tweet)
    VALUES (
        '${tweet}'
    );`;
  await db.run(creatTweetQuery);
  res.send("Created a Tweet");
});

module.exports = app;
