/*
Express Server for CSCI3916 Project
API
*/

var express = require('express');
var bodyParser = require('body-parser');
var cors = require('cors');
var User = require('./Users');
var passport = require('passport');
var jwtAuth = require('./auth_jwt');
var jwt = require('jsonwebtoken');
var Chat = require('./Chats')
var axios = require('axios');
var Pusher = require('pusher');

var corsOptions = {
    origin: '*', // Allows requests from any origin
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Specify allowed HTTP methods
    allowedHeaders: ['Content-Type', 'Authorization'], // Specify allowed request headers
    credentials: true, // Enable credentials (cookies, authorization headers, etc.)
};

var app = express();
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(passport.initialize());

const pusher = new Pusher({
    appId: "1795639",
    key: "59737af5c15b06f7dce2",
    secret: "13e2dd9ef92b02cc7cd1",
    cluster: "mt1",
    useTLS: true
});

var router = express.Router();

//User Methods (SignUp and SignIn)
router.post('/signup', function(req, res) {
    if (!req.body.username || !req.body.password) {
        res.json({success: false, msg: 'Please include both username and password to signup.'})
    } else {
        var user = new User();
        user.name = req.body.name;
        user.username = req.body.username;
        user.password = req.body.password;

        user.save(function(err){
            if (err) {
                if (err.code == 11000)
                    return res.json({ success: false, message: 'A user with that username already exists.'});
                else
                    return res.json(err);
            }

            res.json({success: true, msg: 'Successfully created new user.'})
        });
    }
});

router.post('/signin', function (req, res) {
    var userNew = new User();
    userNew.username = req.body.username;
    userNew.password = req.body.password;

    User.findOne({ username: userNew.username }).select('name username password').exec(function(err, user) {
        if (err) {
            res.send(err);
        }
        if (!user) {
            return res.status(401).send({ success: false, msg: 'Authentication failed: User not found.' });
        }
        
        user.comparePassword(userNew.password, function(isMatch) {
            if (isMatch) {
                console.log('Success');
                var userToken = { id: user.id, username: user.username };
                var token = jwt.sign(userToken, process.env.SECRET_KEY);
                res.json ({success: true, token: 'JWT ' + token});
            }
            else {
                res.status(401).send({success: false, msg: 'Authentication failed.'});
            }
        })
    })
});

router.route('/Chat')
    .get(jwtAuth.isAuthenticated, async (req,res) => {
        try {
            const supportedLang = [ 'EN', 'FR', 'ES' ];
            var language = req.query.language || 'EN';
            if (!supportedLang.includes(req.query.language))
                language = 'EN';
    
            const chatMessages = await Chat.find().lean();
    
            const formattedMessages = chatMessages.map(message => {
                const translatedText = message.translatedText[language];
                return {
                    username: message.username,
                    translatedText: translatedText,
                    timeStamp: message.timeStamp,
                };
            });
    
            res.json(formattedMessages);
        } catch (error) {
            console.error('Error retrieving chat messages:', error);
            res.status(500).json({ success: false, msg: 'Failed to retrieve chat messages' });
        }
    })
    .post(jwtAuth.isAuthenticated, async (req,res) => {
        try {
            const { user, text } = req.body;

            //Translation
            const deepApiUrl = 'https://api-free.deepl.com/v2/translate';
            const deepApiKey = process.env.API_KEY;
            const targetLang = 'EN';
            const response = await axios.post(
                deepApiUrl,
                {
                    text:[text],
                    target_lang: targetLang,
                },
                {
                    headers: {
                        'Authorization': `DeepL-Auth-Key ${deepApiKey}`,
                        'Content-Type': 'application/json',
                    },
                }
            );
            const detectedLanguage = response.data.translations[0].detected_source_language;
            const translatedText = response.data.translations[0].text;

            const supportedLang = ['EN', 'FR', 'ES', 'NB'];
            if (!supportedLang.includes(detectedLanguage)) {
                return res.status(400).json({ success: false, msg: 'Unsupported language'});
            }
            
            const translationMap = {};
            translationMap[targetLang] = translatedText;
            translationMap[detectedLanguage] = text;
            for (const lang of supportedLang) {
                if (lang !== detectedLanguage) {
                    const translationResponse = await axios.post(
                        deepApiUrl,
                        {
                            text:[text],
                            target_lang: lang,
                        },
                        {
                            headers: {
                                'Authorization': `DeepL-Auth-Key ${deepApiKey}`,
                                'Content-Type': 'application/json',
                            },
                        }  
                    );
                    translationMap[lang] = translationResponse.data.translations[0].text;
                }
            }

            const newChat = new Chat({
                username: user,
                originText: text,
                translatedText: translationMap,
                timeStamp: new Date(),
            });

            await newChat.save();
            
            pusher.trigger('chatNotifs', 'chat-submitted', {
                message: newChat
            });

            res.json({ success:true, message: newChat });
        }
        catch(error) {
            res.status(500).json({ success: false, msg: error});
        }
    })
    .all((req, res) => {
        // Any other HTTP Method
        // Returns a message stating that the HTTP method is unsupported.
        res.status(405).send({ message: 'HTTP method not supported.' });
    });

app.use('/', router);
app.listen(process.env.PORT || 8080);