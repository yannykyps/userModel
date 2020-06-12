require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const ejs = require("ejs");
const bcrypt = require("bcrypt");
const saltRounds = 10;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const passport = require("passport");
const findOrCreate = require("mongoose-findorcreate");
const passportLocalMongoose = require("passport-local-mongoose");
const session = require("express-session");

const app = express();

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(express.static("public"));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect("mongodb://localhost:27017/userModelDB", {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  googleId: String
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = new mongoose.model("User", userSchema);

passport.use(User.createStrategy());

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

app.get("/", function(req, res){
  res.render("home");
});

app.get("/login", function(req, res){
  res.render("login");
});

app.get("/register", function(req, res){
  res.render("register");
});

app.get("/auth/google",
  passport.authenticate("google", { scope: ["profile"] })
);

app.get("/auth/google/welcome",
  passport.authenticate("google", { failureRedirect: "/login" }),
  function(req, res) {
    // Successful authentication, redirect secrets.
    res.redirect('/welcome');
  });

  app.get("/welcome", function (req, res) {
    User.find({"secret": {$ne: null}}, function(err, foundUsers){
      if (err) {
        console.log(err);
      } else {
        if (foundUsers) {
          res.render("welcome", {usersWithSecrets: foundUsers});
        }
      }
    });
  });

// app.post("/register", function(req, res){
//
//   bcrypt.hash(req.body.password, saltRounds, function(err, hash) {
//     const newUser = new User({
//       email: req.body.username,
//       password: hash
//     });
//
//     newUser.save(function(err){
//       if (err) {
//         console.log(err);
//       } else {
//         res.render("welcome");
//       }
//     });
//   });
// });
app.post("/register", function(req, res){

User.register({username: req.body.username}, req.body.password, function(err, user){
  if (err) {
    console.log(err);
    res.redirect("/register");
  } else {
    passport.authenticate("local")(req, res, function(){
      res.redirect("/welcome");
    });

  }
});
});


passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/welcome",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  },
  function(accessToken, refreshToken, profile, cb) {
    console.log(profile);
    User.findOrCreate({ googleId: profile.id }, function (err, user) {
      return cb(err, user);
    });
  }
));

app.listen(3000, function() {
  console.log("Server started on port 3000");
});
