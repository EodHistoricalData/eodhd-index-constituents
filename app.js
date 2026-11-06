/**
 * Mounts IndexConstituentsView, but only once the local
 * server confirms a key is configured. Without one the key gate renders
 * instead and this never runs -- these apps show nothing at all without an
 * EODHD key, which is the point of them.
 */
function App() {
  // Dark by default, light on request, remembered in localStorage. The views
  // carry both themes; the switch is the frame's.
  var themeState = React.useState(window.AppFrame.savedTheme());
  var theme = themeState[0];
  var toggleTheme = function () {
    var next = theme === 'light' ? 'dark' : 'light';
    window.AppFrame.saveTheme(next);
    themeState[1](next);
  };
  // IndexConstituentsView reads a followed link and Back/Forward itself
  // (its own hashchange handler), and moves the focus as it does: it is
  // not mounted afresh on a hashchange.
  return (
    // AppFrame watches every feed the view touches and puts the explanation
    // above the view when a refusal or a failed request arrives. The view
    // fetches its own data, so that answer only exists after the first render.
    React.createElement(window.AppFrame, {
      capability: 'marketplace',
      otherFeaturesWork: false,
      hasAIFeatures: true,
      // What still works when one of the app's secondary feeds is refused.
      refusalNotes: {},
      silentRefusals: [],
      // The view's own inner padding, so the shell's panels line up with its
      // heading instead of sitting a step to the left of it.
      contentInset: 0,
      theme: theme,
      onToggleTheme: toggleTheme,
    },
      React.createElement(React.Fragment, null,
      React.createElement(window.IndexConstituentsView, { apiKey: 'proxy', theme: theme, onSelectAsset: window.EODHDLinks.openAsset })
      )
    )
  );
}

// Whether the first screen waits for the key's plan (meta.json askPlan).
window.EODHD_ASK_PLAN = false;

// Whether React arrived is decided in boot.js, the first file of the bundle;
// nothing reaches this line without it.
window.KeyGate.guard(function () {
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
});
