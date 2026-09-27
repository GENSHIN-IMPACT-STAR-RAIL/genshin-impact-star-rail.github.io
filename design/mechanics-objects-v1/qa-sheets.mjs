import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const sharp=require('C:/Users/17157/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
for(const name of ['全部变体-light','连接点与选中状态-dark']){
 const p=new URL('./'+name+'.png',import.meta.url);const meta=await sharp(fs.readFileSync(p)).metadata();const chunk=1100;
 for(let y=0,i=1;y<meta.height;y+=chunk,i++) await sharp(fs.readFileSync(p)).extract({left:0,top:y,width:meta.width,height:Math.min(chunk,meta.height-y)}).png().toFile(fileURLToPath(new URL('./qa-'+name+'-'+i+'.png',import.meta.url)));
}
