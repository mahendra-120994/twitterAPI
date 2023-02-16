const express = require("express");
const path = require("path");

const app = express();
app.use(express.json());

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// const jsonMiddleware = express.json();
// app.use(jsonMiddleware);

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

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, "SECRET", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

//API 1

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  console.log(request.body);

  const userQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const user = await db.get(userQuery);

  if (user !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      try {
        const hashedPassword = await bcrypt.hash(request.body.password, 10);
        const insertQuery = `INSERT INTO user
        (name,username,password,gender)
        VALUES
        (
            '${name}',
            '${username}',
            '${hashedPassword}',
            '${gender}'
        );`;
        await db.run(insertQuery);
        response.status(200);
        response.send("User created successfully");
      } catch (e) {
        console.log(e.message);
      }
    }
  }
});

// API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const userCheckQuery = `SELECT * FROM user WHERE username ='${username}';`;
  const user = await db.get(userCheckQuery);

  if (user === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, user.password);
    if (isPasswordMatched === false) {
      response.status(400);
      response.send("Invalid password");
    } else {
      const payload = { username };
      const jwtToken = jwt.sign(payload, "SECRET");
      console.log(jwtToken);
      response.status(200);
      response.send({ jwtToken });
    }
  }
});

//API 3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const tweetQuery = ` SELECT 
  user.username,
  tweet.tweet,
  tweet.date_time as dateTime
  FROM 
  (follower INNER JOIN user ON user.user_id = follower.following_user_id) as t1 
  INNER JOIN
  tweet on tweet.user_id = follower.following_user_id 
  WHERE tweet.user_id IN
   (SELECT 
    follower.following_user_id 
    FROM follower 
    INNER JOIN user ON user.user_id = follower.follower_user_id 
    WHERE user.username like "${username}") 
    GROUP BY tweet.tweet_id
    ORDER BY dateTime
    LIMIT 4;`;
  const dbUser = await db.all(tweetQuery);
  response.send(dbUser);
  console.log(dbUser);
});

//API 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const query = `SELECT 
  distinct(user.name) 
  FROM follower 
  INNER JOIN user ON user.user_id = follower.follower_user_id 
  WHERE user.user_id IN 
    (SELECT follower.following_user_id FROM 
    follower INNER JOIN user on user.user_id=follower.follower_user_id 
    WHERE user.username like '${username}');`;
  const user = await db.all(query);
  response.send(user);
});

// API 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const query = `SELECT distinct(user.name) FROM follower 
  INNER JOIN user on user.user_id = follower.follower_user_id 
  WHERE user.user_id IN 
    (SELECT follower.follower_user_id FROM 
    follower INNER JOIN user on user.user_id=follower.following_user_id 
    WHERE user.username like '${username}');`;
  const user = await db.all(query);
  response.send(user);
});

// API 6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const query = `SELECT 
  tweet.tweet,
  count(distinct(like_id)) as likes,
  count(distinct(reply_id)) as replies,
  tweet.date_time as dateTime 
  FROM (tweet INNER JOIN like ON like.tweet_id = tweet.tweet_id) as t1 
  INNER JOIN 
  reply ON reply.tweet_id = t1.tweet_id 
  WHERE tweet.tweet_id = ${tweetId} and tweet.user_id IN 
    (SELECT 
        follower.following_user_id 
        FROM follower INNER JOIN user ON user.user_id=follower.follower_user_id 
        WHERE user.username like '${username}');`;
  const user = await db.get(query);
  const { tweet } = user;
  if (tweet === null) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(user);
  }
});
//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const query = `
    SELECT 
    user.username as likes
    FROM (user INNER JOIN like ON like.user_id = user.user_id) as t1 
    INNER JOIN 
    tweet on tweet.tweet_id=t1.tweet_id 
    WHERE tweet.tweet_id = ${tweetId} and tweet.user_id IN 
      (SELECT follower.following_user_id 
        FROM follower 
        INNER JOIN user ON user.user_id = follower.follower_user_id 
        WHERE user.username like '${username}');`;
    const user = await db.all(query);
    let lis = [];
    let likes = "";
    for (let i in user) {
      const { likes } = user[i];
      lis.push(likes);
    }
    if (lis[0] === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send({ likes: lis });
    }
    console.log(lis[0]);
  }
);

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const query = `SELECT 
    user.name,reply.reply
    FROM 
    (user INNER JOIN reply on reply.user_id = user.user_id) as t1 
    INNER JOIN tweet ON tweet.tweet_id=t1.tweet_id 
    WHERE tweet.tweet_id = ${tweetId} and tweet.user_id IN 
       (SELECT follower.following_user_id 
        FROM follower INNER JOIN user on user.user_id = follower.follower_user_id 
        WHERE user.username like '${username}');`;
    const user = await db.all(query);
    if (user[0] === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send({ replies: user });
    }
  }
);
//API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const query = `SELECT 
  tweet.tweet,
  count(distinct(like_id)) as likes,
  count(distinct(reply_id)) as replies,
  tweet.date_time as dateTime 
  FROM 
  (tweet INNER JOIN like ON like.tweet_id = tweet.tweet_id) as t1 
  INNER JOIN 
  reply on reply.tweet_id = t1.tweet_id 
  WHERE tweet.tweet_id IN 
    (SELECT tweet.tweet_id 
     FROM user 
     INNER JOIN tweet on tweet.user_id = user.user_id
     WHERE user.username like '${username}') 
     GROUP by tweet.tweet_id;`;
  const user = await db.all(query);
  response.send(user);
  console.log(user);
});
//API 10

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  const user = `SELECT user_id FROM user WHERE username ='${username}';`;
  const userId = await db.get(user);
  const { user_id } = userId;
  const insertQuery = `INSERT INTO tweet 
  (tweet,user_id)
  VALUES 
  ('${tweet}',
  ${user_id});`;
  const insert = await db.run(insertQuery);
  console.log(insert);
  response.send("Created a Tweet");
});

// API 11

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const deleteQuery = `DELETE 
    FROM tweet 
    WHERE tweet_id=${tweetId} and 
      tweet.user_id = (SELECT user_id FROM user WHERE username='${username}');`;
    const del = await db.run(deleteQuery);
    const changes = del.changes;
    console.log(changes);
    if (changes === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send("Tweet Removed");
    }
  }
);
module.exports = app;

