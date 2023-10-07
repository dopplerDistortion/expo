import { Command } from '@expo/commander';
import spawnAsync from '@expo/spawn-async';
import chalk from 'chalk';
import { PromisyClass, TaskQueue } from 'cwait';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

import { EXPO_DIR } from '../Constants';
import logger from '../Logger';

function allVersions(min, max) {
  const versions: string[] = [];
  for (let i = min; i <= max; i++) {
    versions.push(i.toString());
  }
  return versions;
}

function getReleasedSdkVersionRange() {
  const packageJson = fs.readJSONSync(path.join(EXPO_DIR, 'packages', 'expo', 'package.json'));
  const expoPackageVersion = packageJson.version;
  let maxSdk = parseInt(expoPackageVersion.split('.')[0], 10);
  // if current version is an alpha or beta, then one version behind is the latest stable release
  if (expoPackageVersion.includes('alpha') || expoPackageVersion.includes('beta')) {
    maxSdk--;
  }
  return {
    maxSdk,
    minSdk: maxSdk - 6,
  };
}

const executeDiffCommand = async (diffDirPath: string, sdkFrom: string, sdkTo: string) => {
  function sdkToBranch(sdkVersion: string) {
    if (sdkVersion === 'unversioned') {
      return 'main';
    }
    return `sdk-${sdkVersion}`;
  }

  const diffPath = path.join(diffDirPath, `${sdkFrom}..${sdkTo}.diff`);

  const diffCommand = `origin/${sdkToBranch(sdkFrom)}..origin/${sdkToBranch(sdkTo)}`;

  const diff = await spawnAsync(
    'git',
    ['diff', diffCommand, '--', 'templates/expo-template-bare-minimum'],
    {
      cwd: EXPO_DIR,
    }
  );

  fs.writeFileSync(diffPath, diff.stdout);
};

async function action() {
  const taskQueue = new TaskQueue(Promise as PromisyClass, os.cpus().length);

  const diffDirPath = path.join(
    EXPO_DIR,
    'docs',
    'public',
    'static',
    'diffs',
    'template-bare-minimum'
  );

  try {
    //const sdkVersions = await readSdkVersions(diffDirPath, sdk);
    // generate from all other SDK version to the specified SDK version
    let diffJobs: PromiseLike<any>[] = [];

    const { minSdk, maxSdk } = getReleasedSdkVersionRange();

    const sdkVersionsToDiff = allVersions(minSdk, maxSdk);
    sdkVersionsToDiff.push('unversioned');

    // clear all versions before regenerating
    await spawnAsync('rm', ['-rf', diffDirPath]);
    fs.mkdirSync(diffDirPath);

    // start with the lowest SDK version and diff it with all other SDK versions equal to or lower than it
    sdkVersionsToDiff.forEach((toSdkVersion) => {
      const sdkVersionsLowerThenOrEqualTo =
        toSdkVersion === 'unversioned'
          ? sdkVersionsToDiff
          : sdkVersionsToDiff.filter((s) => s <= toSdkVersion);
      diffJobs = diffJobs.concat(
        sdkVersionsLowerThenOrEqualTo.map((fromSdkVersion) =>
          taskQueue.add(() => executeDiffCommand(diffDirPath, fromSdkVersion, toSdkVersion))
        )
      );
    });
    await Promise.all(diffJobs);
    // write the list of SDK versions to a file to generate list of versions for which diffs can be viewed
    fs.writeFileSync(path.join(diffDirPath, 'versions.json'), JSON.stringify(sdkVersionsToDiff));

    logger.log(
      chalk.green(
        `\n🎉 Successfully generated diffs for template-bare-minimum for the last 6 SDK versions + main`
      )
    );
  } catch (error) {
    logger.error(error);
  }
}

export default (program: Command) => {
  program
    .command('generate-bare-diffs')
    .alias('gbd')
    .description(
      `Generate diffs of template-bare-minimum for bare upgrade instructions for the last 6 versions.`
    )
    .asyncAction(action);
};
