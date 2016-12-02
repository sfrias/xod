import { expect } from 'chai';

import path from 'path';
import loadLibs from '../src/loadLibs';
import libsFixture from './fixtures/libs.json';

const workspaceDir = './fixtures/workspace';

describe('Library loader', () => {
  const workspace = path.resolve(__dirname, workspaceDir);

  it('should load xod/core libs from ./fixtures/workspace/lib', (done) => {
    const nodeTypes = Object.assign({}, libsFixture);
    delete nodeTypes['@/sub/aux']; // lib loader don't know anything about patch nodes!

    loadLibs(['xod/core'], workspace)
      .then((data) => {
        expect(data).to.deep.equal(nodeTypes);
        done();
      })
      .catch(done);
  });
});