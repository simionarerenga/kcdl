/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: 'com.kcdl.coprainspector',
  appName: 'Copra Inspector',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    Camera: {},
    Preferences: {},
  },
};

module.exports = config;
