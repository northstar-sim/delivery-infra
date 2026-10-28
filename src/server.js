import http from 'node:http';
import { status } from './service.js';
http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(status()));}).listen(Number(process.env.PORT||8080),'0.0.0.0');
