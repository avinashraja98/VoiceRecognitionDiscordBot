const Discord = require('discord.js');
const client = new Discord.Client();
const config = require('./config.json');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const { Readable } = require('stream');
const { exec } = require('child_process');

var isInVoice = false;
var connection = null;

class Silence extends Readable {
    _read() {
        this.push(Buffer.from([0xF8, 0xFF, 0xFE]))
    }
}

client.login(config.token);

client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', async (message) => {

    if (message.content === 'ping') {
        message.reply('Pong!');
    }

    // Join the same voice channel of the author of the message
    if (message.member.voice.channel && message.content === '=join') {

        const user = message.member.id;
        connection = await message.member.voice.channel.join();

        connection.play(new Silence(), { type: 'opus' });

        connection.on('speaking', (user, speaking) => {

            if (speaking.bitfield == 0) return;

            // Create a ReadableStream of s16le PCM audio
            const receiver = connection.receiver.createStream(user, {
                mode: "pcm",
                end: "silence"
            });

            const writer = receiver.pipe(fs.createWriteStream(`./recorded-${user.id}.pcm`));
            writer.on("finish", () => {
                ffmpeg(`./recorded-${user.id}.pcm`)
                    .inputOptions(['-f s16le', '-ar 48000', '-channels 2'])
                    .outputOptions(['-f wav', '-ar 16000', '-ac 1'])
                    .save(`./recorded-${user.id}.wav`)
                    .on('end', function () {
                        exec(`python3 recog.py recorded-${user.id}.wav`, (error, stdout, stderr) => {
                            if (error) {
                                console.error(`error: ${error.message}`);
                                return;
                            }

                            if (stderr) {
                                console.error(`stderr: ${stderr}`);
                                return;
                            }
                            var output = JSON.parse(stdout);
                            if (output.text === "") return;
                            console.log(user.username, ": ", output.text);
                            message.channel.send(user.username + ": " + output.text);
                        });
                    });
            });
        });

        isInVoice = true;
    }

    if (message.content === '=Run it back') { // temp command to re-play the listen to the audio that u just said.

        const voicechannel = message.member.voice.channel;

        if (!fs.existsSync(`./recorded-${message.author.id}.pcm`)) return message.channel.send("Your audio is not recorded!");

        const connection = await message.member.voice.channel.join();
        const stream = fs.createReadStream(`./recorded-${message.author.id}.pcm`);

        const dispatcher = connection.play(stream, {
            type: "converted"
        });

        dispatcher.on("finish", () => {
            return message.channel.send("finished playing audio");
        });
    }

    if (isInVoice && message.content === '=dc') {
        connection.disconnect();
        connection = null
        console.log("cleared");
    }
});