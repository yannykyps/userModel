require("dotenv").config();
const express = require("express");
const cookieParser = require('cookie-parser')
const bodyParser = require("body-parser");
const flash = require("connect-flash");
const utils = require("./utils");
const mongoose = require("mongoose");
const ejs = require("ejs");
const passport = require("passport");
const findOrCreate = require("mongoose-findorcreate");
const passportLocalMongoose = require("passport-local-mongoose");
const session = require("express-session");
const { check, validationResult, body } = require("express-validator");

const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const RememberMeStrategy = require("passport-remember-me").Strategy;

let validationError = "";

const app = express();

app.set('view engine', 'ejs');
app.use(cookieParser());
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));
app.use(session({
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: false
}));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
app.use(passport.authenticate('remember-me'));

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

const tokenSchema = new mongoose.Schema({
  userId: String,
  token: String
})

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = new mongoose.model("User", userSchema);
const Token = mongoose.model("Token", tokenSchema);

passport.use(User.createStrategy());

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

passport.use(new RememberMeStrategy(
  function(token, done) {
    Token.consume(token, function (err, user) {
      if (err) { return done(err); }
      if (!user) { return done(null, false); }
      return done(null, user);
    });
  },
  function(user, done) {
    var token = utils.randomString(64);
    Token.save(token, { userId: user.id }, function(err) {
      if (err) { return done(err); }
      return done(null, token);
    });
  }
));

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
  res.render("home", {user: req.user});
});

app.get("/login", function(req, res){
  res.render("login", {user: req.user, error: req.flash("error")});
});

app.get("/register", function(req, res){
  res.render("register", {error: req.flash("error")});
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

app.get("/welcome", ensureAuthenticated, function (req, res) {
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

app.post("/register",
[
  check("username").custom(value => {
  return User.exists({username: value}).then(user => {
    if (user) {
      return Promise.reject('E-mail has already been registered');
    }
    })
  }),
  check('username').isEmail(),
  check('password').isLength({ min: 8 }).withMessage("Password must be at least 8 chars long")
  .matches(/\d/).withMessage("Password must also contain a number")
  .matches(/[A-Z]/).withMessage("Password must also contain at least one uppercase letter")
], (req, res, next) => {

const errorFormatter = ({ location, msg, param, value, nestedErrors }) => {
    return `${msg}`;
  };
  const err = validationResult(req).formatWith(errorFormatter);
  if (!err.isEmpty()) {
    console.log(err.array());
    req.flash("error", err.array({ onlyFirstError: true }));
    res.redirect("/register")
  } else {

User.register({username: req.body.username}, req.body.password, function(err, user){
  if (err) {
    console.log(err);
    res.redirect("/register");
  } else {
    validationError = ""; //setting error const back to ""
    passport.authenticate("local")(req, res, function(){
      res.redirect("/welcome");
    });
  }
});
}

});

app.post("/login",
passport.authenticate('local', {failureRedirect: '/login', failureFlash: "Invalid Username or Password"}),
function(req, res, next) {

  // issue a remember me cookie if the option was checked
  if (!req.body.remember_me) { return next(); }

  var token = new Token({
    userId: req.user.id,
    token: utils.randomString(64)
  })
  token.save(function(err) {
    if (err) { return done(err); }
    res.cookie('remember_me', token, { path: '/welcome', httpOnly: true, maxAge: 604800000 }); // 7 days
    return next();
  });
},
function(req, res) {
  res.redirect('/welcome');
});


// app.post("/login", function(req, res, next){
//
// const user = new User({
//   username: req.body.username,
//   password: req.body.password
// });
//
// passport.authenticate('local', function(err, user, info) {
//     if (err) { return next(err); }
//     if (!user) {
//       validationError = "Incorrect Username and/or Password";
//       return res.redirect('/login'); }
//     req.logIn(user, function(err) {
//       if (err) { return next(err); }
//       validationError = ""; //setting error const back to ""
//       return res.redirect('/welcome');
//     });
//   })(req, res, next);
// });

app.get("/logout", function (req, res){
  res.clearCookie("remember-me");
  req.logout();
  res.redirect("/");
});

app.listen(3000, function() {
  console.log("Server started on port 3000");
});

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/login')
}
