#target photoshop

(function () {
    try {
        if (typeof ExternalObject !== "undefined") {
            new ExternalObject("lib:\\PlugPlugExternalObject");
        }

        var rgb = app.foregroundColor.rgb;
        var event = new CSXSEvent();
        event.type = "com.ccd.colorpalette.foregroundChanged";
        event.data = [
            Math.round(Number(rgb.red)),
            Math.round(Number(rgb.green)),
            Math.round(Number(rgb.blue))
        ].join(",");
        event.dispatch();
    } catch (error) {
    }
}());
