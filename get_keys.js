import webpush from 'web-push';
import fs from 'fs';
const keys = webpush.generateVAPIDKeys();
fs.writeFileSync('vapid.json', JSON.stringify(keys, null, 2));
console.log('Keys written to vapid.json');
