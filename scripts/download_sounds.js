const fs = require('fs');
const path = require('path');
const https = require('https');

const SOUNDS_DIR = path.join(__dirname, '..', 'public', 'sounds');

const SOUND_SOURCES = {
  airhorn: 'https://raw.githubusercontent.com/3kh0/soundboard/main/sounds/airhorn.mp3',
  clap: 'https://raw.githubusercontent.com/Sidmaz666/meme_board_app/main/assets/sounds/slap.mp3',
  laugh: 'https://raw.githubusercontent.com/3kh0/soundboard/main/sounds/woody-woodpecker-laugh.mp3',
  ding: 'https://raw.githubusercontent.com/Sidmaz666/meme_board_app/main/assets/sounds/ding.mp3',
  bruh: 'https://raw.githubusercontent.com/Sidmaz666/meme_board_app/main/assets/sounds/bruh.mp3',
  sad: 'https://raw.githubusercontent.com/Sidmaz666/meme_board_app/main/assets/sounds/sad_meow.mp3',
  win: 'https://raw.githubusercontent.com/Sidmaz666/meme_board_app/main/assets/sounds/rizz.mp3',
  drum: 'https://raw.githubusercontent.com/3kh0/soundboard/main/sounds/badumtss.mp3',
  fart: 'https://raw.githubusercontent.com/Sidmaz666/meme_board_app/main/assets/sounds/fart.mp3',
  pop: 'https://raw.githubusercontent.com/Sidmaz666/meme_board_app/main/assets/sounds/quack.mp3'
};

if (!fs.existsSync(SOUNDS_DIR)) {
  fs.mkdirSync(SOUNDS_DIR, { recursive: true });
}

console.log('Downloading high-quality meme sound files...');

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`✓ Downloaded ${path.basename(dest)}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function start() {
  for (const [name, url] of Object.entries(SOUND_SOURCES)) {
    const dest = path.join(SOUNDS_DIR, `${name}.mp3`);
    try {
      await downloadFile(url, dest);
    } catch (e) {
      console.error(`✗ Completely failed to download ${name}.mp3:`, e.message);
    }
  }
  console.log('Sound downloads completed!');
}

start();
