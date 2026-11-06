/**
 * Generated. The app's identity -- used for link tags, the key screen and the
 * footer -- and the check that React loaded before anything reads it.
 */
window.APP_META = {
  "app": "index-constituents",
  "repo": "eodhd-index-constituents",
  "title": "EODHD Index Constituents",
  "description": "Browse the members of any S&P or Dow Jones index, live, on your own EODHD key.",
  "keyNote": "Needs the S&P and Dow Jones index constituents add-on from the EODHD Marketplace, which is paid. On a free key the app opens and tells you exactly that.",
  "storage": []
};

if (!window.React || !window.ReactDOM) {
  var bootError = document.getElementById('boot-error');
  if (bootError) bootError.style.display = 'block';
  throw new Error('React did not load from unpkg.com, so the app cannot start. See the message on the page.');
}
