import { ClientSettings } from "clientSettings"

export function embedSnippet(clientSettings: ClientSettings): string {
    return `
        window.App = {};

        var link = document.createElement('link');
        link.type = 'text/css';
        link.rel = 'stylesheet';
        link.href = '${clientSettings.getWebPackUrl("commons.css")}';
        document.head.appendChild(link);

        var hasPolyfill = false;
        var hasGrapher = false;

        var loadedScripts = 0;
        function checkReady() {
            loadedScripts += 1;
            if (loadedScripts == 3) {
                window.Grapher.embedAll();
            }
        }

        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.onload = checkReady;
        script.src = "https://cdn.polyfill.io/v2/polyfill.min.js?features=es6,fetch"
        document.head.appendChild(script);

        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.onload = checkReady;
        script.src = '${clientSettings.getWebPackUrl("commons.js")}';
        document.head.appendChild(script);

        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.onload = checkReady;
        script.src = '${clientSettings.getWebPackUrl("owid.js")}';
        document.head.appendChild(script);
    `
}
