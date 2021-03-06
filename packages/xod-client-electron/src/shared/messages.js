import composeMessage from './composeMessage';
import * as EVENTS from './events';

export const CODE_TRANSPILED = 'Project was successfully transpiled. Searching for device...';
export const PORT_FOUND = 'Port with connected Arduino was found. Installing toolchains...';
export const TOOLCHAIN_INSTALLED = 'Toolchain is installed. Uploading...';
export const CLOUD_TOOLCHAIN_INSTALLED = 'Toolchain is installed. Compiling code in the cloud...';
export const CODE_COMPILED = 'Code compiled succesfully. Uploading...';

export const ENUMERATING_PORTS = 'Enumerating...';
export const ENUMERATING_BOARDS = 'Loading list of supported boards...';
export const NO_PORTS_FOUND = 'No connected boards found';

export const SUCCESS = {
  [EVENTS.SAVE_ALL]: 'Saved successfully',
};

export const SAVE_ALL_PROCESSED = '';
export const SAVE_ALL_FAILED = 'Failed to save project.';
export const SAVE_ALL_SUCCEED = 'Saved successfully!';

export const DEBUG_SESSION_STOPPED_ON_CHANGE = composeMessage(
  'Debug session stopped',
  'Your Project has been changed.'
);
export const DEBUG_SESSION_STOPPED_ON_TAB_CLOSE = composeMessage(
  'Debug session stopped',
  'You closed Debugger tab.'
);
export const DEBUG_LOST_CONNECTION = 'Lost connection with the device.';

export const updateAvailableMessage = version => composeMessage(
  'Update available',
  `New version ${version} of XOD\u00A0IDE is available`,
  'Download & Install'
);
