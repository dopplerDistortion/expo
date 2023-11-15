import { vol, fs } from 'memfs';

import { createControlledEnvironment, getFiles } from '../env';

/** The original reference to `process.env`, containing the actual environment variables. */
const originalEnv = process.env as Readonly<NodeJS.ProcessEnv>;
/** Mock the environment variables, to be edited within tests */
function mockEnv() {
  process.env = { ...originalEnv } as NodeJS.ProcessEnv;
}

beforeEach(() => {
  vol.reset();
  mockEnv();
});
afterAll(() => {
  // Clear the mocked environment, reusing the original object instance
  process.env = originalEnv;
});

describe(getFiles, () => {
  const originalError = console.error;
  beforeEach(() => {
    console.error = jest.fn();
    mockEnv();
  });
  afterEach(() => {
    console.error = originalError;
  });

  it(`gets development files`, () => {
    expect(getFiles('development')).toEqual([
      '.env.development.local',
      '.env.local',
      '.env.development',
      '.env',
    ]);
  });
  it(`gets production files`, () => {
    expect(getFiles('production')).toEqual([
      '.env.production.local',
      '.env.local',
      '.env.production',
      '.env',
    ]);
  });
  it(`gets test files`, () => {
    // important
    expect(getFiles('test')).toEqual(['.env.test.local', '.env.test', '.env']);
  });
  it(`gets no files when dotenv is disabled`, () => {
    process.env.EXPO_NO_DOTENV = '1';

    expect(originalEnv.EXPO_NO_DOTENV).toBeUndefined();

    ['development', 'production', 'test'].forEach((mode) => {
      expect(getFiles(mode)).toEqual([]);
    });
  });

  it(`throws if NODE_ENV is not set`, () => {
    getFiles(undefined);

    expect(console.error).toBeCalledTimes(2);
    expect(console.error).toBeCalledWith(
      expect.stringContaining('The NODE_ENV environment variable is required but was not specified')
    );
  });
  it(`throws if NODE_ENV is not valid`, () => {
    expect(() => getFiles('invalid')).toThrowErrorMatchingInlineSnapshot(
      `"Environment variable "NODE_ENV=invalid" is invalid. Valid values are "development", "test", and "production"`
    );
  });
});

describe('get', () => {
  beforeEach(() => {
    mockEnv();
  });

  it(`memoizes`, () => {
    const envRuntime = createControlledEnvironment();
    vol.fromJSON(
      {
        '.env': 'FOO=default',
      },
      '/'
    );
    expect(envRuntime.get('/')).toEqual({
      env: {
        FOO: 'default',
      },
      files: ['/.env'],
    });

    fs.writeFileSync('/.env', 'FOO=changed');

    expect(envRuntime.get('/')).toEqual({
      env: {
        FOO: 'default',
      },
      files: ['/.env'],
    });
    expect(envRuntime.get('/', { force: true })).toEqual({
      env: {
        FOO: 'changed',
      },
      files: ['/.env'],
    });
  });
});
describe('_getForce', () => {
  beforeEach(() => {
    mockEnv();
  });

  it(`returns the value of the environment variable`, () => {
    const envRuntime = createControlledEnvironment();
    vol.fromJSON(
      {
        '.env': 'FOO=bar',
      },
      '/'
    );

    expect(envRuntime._getForce('/')).toEqual({
      env: {
        FOO: 'bar',
      },
      files: ['/.env'],
    });
  });

  it(`cascades env files (development)`, () => {
    process.env.NODE_ENV = 'development';
    const envRuntime = createControlledEnvironment();
    vol.fromJSON(
      {
        '.env': 'FOO=default',
        '.env.local': 'FOO=default-local',
        '.env.development': 'FOO=dev',
        '.env.production': 'FOO=prod',
        '.env.production.local': 'FOO=prod-local',
        '.env.development.local': 'FOO=dev-local',
      },
      '/'
    );

    expect(envRuntime._getForce('/')).toEqual({
      env: {
        FOO: 'dev-local',
      },
      files: ['/.env.development.local', '/.env.local', '/.env.development', '/.env'],
    });
  });

  it(`cascades env files (production)`, () => {
    process.env.NODE_ENV = 'production';
    const envRuntime = createControlledEnvironment();
    vol.fromJSON(
      {
        '.env': 'FOO=default',
        '.env.local': 'FOO=default-local',
        '.env.production': 'FOO=prod',
        '.env.production.local': 'FOO=prod-local',
      },
      '/'
    );

    expect(envRuntime._getForce('/')).toEqual({
      files: ['/.env.production.local', '/.env.local', '/.env.production', '/.env'],
      env: {
        FOO: 'prod-local',
      },
    });
  });

  it(`cascades env files (default)`, () => {
    const envRuntime = createControlledEnvironment();
    vol.fromJSON(
      {
        '.env': 'FOO=default',
        '.env.local': 'FOO=default-local',
      },
      '/'
    );

    expect(envRuntime._getForce('/')).toEqual({
      files: ['/.env.local', '/.env'],
      env: {
        FOO: 'default-local',
      },
    });
  });

  it(`skips modifying the environment with dotenv if disabled with EXPO_NO_DOTENV`, () => {
    process.env.EXPO_NO_DOTENV = '1';
    const envRuntime = createControlledEnvironment();
    vol.fromJSON(
      {
        '.env': 'FOO=default',
        '.env.local': 'FOO=default-local',
      },
      '/'
    );

    expect(envRuntime._getForce('/')).toEqual({ env: {}, files: [] });
  });

  it(`does not return the env var if the initial the value of the environment variable`, () => {
    const envRuntime = createControlledEnvironment();
    process.env.FOO = 'not-bar';

    vol.fromJSON(
      {
        '.env': 'FOO=bar',
      },
      '/'
    );

    expect(envRuntime._getForce('/')).toEqual({ env: {}, files: ['/.env'] });
  });

  it(`Does not fail when no files are available`, () => {
    vol.fromJSON({}, '/');
    expect(createControlledEnvironment()._getForce('/')).toEqual({
      env: {},
      files: [],
    });
  });

  it(`Does not assert on invalid env files`, () => {
    vol.fromJSON(
      {
        '.env': 'ˆ˙•ª∆ø…ˆ',
      },
      '/'
    );

    expect(createControlledEnvironment()._getForce('/')).toEqual({ env: {}, files: ['/.env'] });
  });
});

it('does not leak environment variables between tests', () => {
  // If this test fails, it means that the test environment is not set-up properly.
  // Environment variables are leaking between "originalEnv" and "process.env", causing unexpected test failures/passes.
  expect(originalEnv.INTERNAL_LEAK_TEST).toBeUndefined();

  process.env.INTERNAL_LEAK_TEST = 'changed';

  expect(process.env.INTERNAL_LEAK_TEST).toBe('changed');
  expect(originalEnv.INTERNAL_LEAK_TEST).toBeUndefined();
});
