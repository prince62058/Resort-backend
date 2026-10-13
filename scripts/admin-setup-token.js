import {randomBytes} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
const path=new URL('../.env',import.meta.url);
const previous=await readFile(path,'utf8').catch(()=> '');
if(/^ADMIN_SETUP_TOKEN=.+$/m.test(previous))console.log('ADMIN_SETUP_TOKEN already exists in the private .env file.');
else {await writeFile(path,previous.trimEnd()+'\nADMIN_SETUP_TOKEN='+randomBytes(32).toString('hex')+'\n',{mode:0o600});console.log('Saved ADMIN_SETUP_TOKEN in the private .env file. Copy it to the backend environment, then create the owner account in the separate admin app.');}
