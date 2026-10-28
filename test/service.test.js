import test from 'node:test';
import assert from 'node:assert/strict';
import {status} from '../src/service.js';
test('service identifies itself',()=>assert.equal(status().status,'ok'));
