require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const ejs = require("ejs");
const passport = require("passport");
const findOrCreate = require("mongoose-findorcreate");
const passportLocalMongoose = require("passport-local-mongoose");
const session = require("express-session");
const { check, validationResult } = require("express-validator");

const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;

let validationError = [];

const app = express();

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(express.static("public"));

app.use(session({
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect("mongodb://localhost:27017/userModelDB", {
  useNewUrlParser: true,
  useUnifiedTopology: true
});
mongoose.set("useCreateIndex", true);

const userSchema = new mongoose.Schema({
  email: String,
  name: String,
  username: String,
  password: String,
  hobbies: [String]
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

passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/welcome",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  },
  function(accessToken, refreshToken, profile, cb) {
    console.log(profile);
    User.findOrCreate({ username: profile.id, name: profile.displayName}, function (err, user) {
      return cb(err, user);
    });
  }
));

passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_ID,
    clientSecret: process.env.FACEBOOK_SECRET,
    callbackURL: "http://localhost:3000/auth/facebook/welcome"
  },
  function(accessToken, refreshToken, profile, cb) {
    console.log(profile);
    User.findOrCreate({ username: profile.id, name: profile.displayName}, function (err, user) {
      return cb(err, user);
    });
  }
));

app.get("/", function(req, res){
  res.render("home");
});

app.get("/login", function(req, res){
  res.render("login");
});

app.get("/register", function(req, res){
  res.render("register", {error: validationError});
});

app.get("/auth/google",
  passport.authenticate("google", { scope: ["profile"] })
);

app.get("/auth/google/welcome",
  passport.authenticate("google", { failureRedirect: "/login" }),
  function(req, res) {
    // Successful authentication, redirect welcome.
    res.redirect('/welcome');
  });

app.get('/auth/facebook',
  passport.authenticate('facebook'));

app.get('/auth/facebook/welcome',
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('/welcome');
  });

app.get("/welcome", function (req, res) {

  res.render("welcome", {userHobbies: req.user.hobbies, user: req.user.name});
  });


app.get("/submit", function (req, res){
  if (req.isAuthenticated()){
    res.render("submit");
  } else {
    res.redirect("/login");
    }
});

app.post("/submit", function (req, res) {
  const submittedHobby = req.body.hobby;

  User.findById(req.user.id, function(err, foundUser){
    if (err) {
      console.log(err);
    } else {
      if (foundUser) {
        foundUser.hobbies.push(submittedHobby);
        foundUser.save(function(){
          res.redirect("/welcome");
        });
      }
    }
  });
});

app.post("/register", [
  check('username').isEmail(),
  check('password').isLength({ min: 8 }).withMessage("Must be at least 8 chars long")
  .matches(/\d/).withMessage("Must also contain a number")
  .matches(/[A-Z]/).withMessage("Must also contain at least one uppercase letter")
], (req, res, next) => {

const errorFormatter = ({ location, msg, param, value, nestedErrors }) => {
    return `[${param}]: ${msg}`;
  };
  const err = validationResult(req).formatWith(errorFormatter);
  if (!err.isEmpty()) {
    console.log(err.array());
    validationError = err.array();
    res.redirect("/register")
  } else {

User.register({username: req.body.username}, req.body.password, function(err, user){
  if (err) {
    console.log(err);
    validationError = [err];
    res.redirect("/register");
  } else {
    passport.authenticate("local")(req, res, function(){
      res.redirect("/welcome");
    });
  }
});
}
});

app.post("/login", function(req, res){

const user = new User({
  username: req.body.username,
  password: req.body.password
});

req.login(user, function (err){
  if (err){
    console.log(err);
  } else {
    passport.authenticate("local")(req, res, function(){
    res.redirect("/welcome");
  });
  }
});

});

app.get("/logout", function (req, res){
  req.logout();
  res.redirect("/");
});

app.listen(3000, function() {
  console.log("Server started on port 3000");
});
