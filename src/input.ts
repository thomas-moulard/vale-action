import * as core from '@actions/core';
import * as exec from '@actions/exec';

import * as fs from 'fs';
import * as path from 'path';
import * as request from 'request-promise-native';

/**
 * Our expected input.
 *
 * @token is automatically created; see https://bit.ly/336fZSk.
 *
 * @workspace is the directory that Vale is run within.
 *
 * @args are Vale's run-time arguments.
 */
export interface Input {
  token: string, workspace: string, version: string, args: string[]
}

/**
 * Parse our user input and set up our Vale environment.
 */
export async function get(tmp: any, tok: string, dir: string): Promise<Input> {
  // Get the current version of Vale:
  let version = '';
  await exec.exec('vale', ['-v'], {
    listeners: {
      stdout: (buffer: Buffer) => version = buffer.toString().trim(),
    }
  });
  version = version.split(' ').slice(-1)[0];

  let args: string[] = ['--no-exit', '--output=JSON'];
  // Check if we were given an external config file.
  //
  // NOTE: We need to do this first because we may not have a local config file
  // to read the `StylesPath` from.
  const config = core.getInput('config');
  if (config !== '') {
    core.info(`Downloading external config '${config}' ...`);
    await request.get(config)
        .catch((error) => {
          core.warning(`Failed to fetch remote config: ${error}.`);
        })
        .then((body) => {
          try {
            fs.writeFileSync(tmp.name, body);
            core.info(`Successfully fetched remote config.`);
            args.push('--mode-rev-compat');
            args.push(`--config=${tmp.name}`);
          } catch (e) {
            core.warning(`Failed to write config: ${e}.`);
          }
        });
  }

  // Install our user-specified styles:
  const styles = core.getInput('styles').split('\n');
  for (const style of styles) {
    if (style !== '') {
      const name = style.split('/').slice(-1)[0].split('.zip')[0];
      core.info(`Installing style '${name}' ...`);

      let cmd = ['install', name, style];
      if (args.length > 2) {
        cmd = args.concat(cmd);
      }
      await exec.exec('vale', cmd, {cwd: dir});
    }
  }

  // Figure out what we're supposed to lint:
  const files = core.getInput('files');
  if (files == 'all') {
    args.push('.');
  } else if (fs.existsSync(path.resolve(dir, files))) {
    args.push(files)
  } else {
    core.warning(
        `User-specified path (${files}) doesn't exist; falling back to 'all'.`)
    args.push('.');
  }

  core.info(`Vale set-up comeplete; using '${args}'.`);
  return {
    token: tok, workspace: dir, args: args, version: version
  }
}
