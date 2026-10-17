import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRequest} from '../helper/core.mjs';
test('play accepts a task identity, never a caller supplied file or application',()=>{
 assert.equal(validateRequest({id:'1',command:'play',taskId:'saved-task'}).command,'play');
 for(const field of ['path','application','args'])assert.throws(()=>validateRequest({id:'1',command:'play',taskId:'saved-task',[field]:'/tmp/arbitrary'}));
 assert.throws(()=>validateRequest({id:'1',command:'play'}));
});
