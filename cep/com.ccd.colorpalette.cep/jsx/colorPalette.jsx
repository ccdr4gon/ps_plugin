#target photoshop

function colorPaletteClamp(value, minValue, maxValue) {
    value = Math.round(Number(value));
    if (isNaN(value)) {
        value = minValue;
    }
    return Math.min(maxValue, Math.max(minValue, value));
}

function colorPaletteSetForeground(red, green, blue) {
    try {
        var color = new SolidColor();
        color.rgb.red = colorPaletteClamp(red, 0, 255);
        color.rgb.green = colorPaletteClamp(green, 0, 255);
        color.rgb.blue = colorPaletteClamp(blue, 0, 255);
        app.foregroundColor = color;
        return "OK";
    } catch (error) {
        return "ERR:" + error;
    }
}

function colorPaletteGetForeground() {
    try {
        var rgb = app.foregroundColor.rgb;
        var red = colorPaletteClamp(rgb.red, 0, 255);
        var green = colorPaletteClamp(rgb.green, 0, 255);
        var blue = colorPaletteClamp(rgb.blue, 0, 255);
        return red + "," + green + "," + blue;
    } catch (error) {
        return "ERR:" + error;
    }
}

function colorPaletteInstallForegroundNotifier(eventFilePath) {
    try {
        app.notifiersEnabled = true;

        var eventFile = new File(eventFilePath);
        if (!eventFile.exists) {
            return "ERR: notifier file not found: " + eventFile.fsName;
        }

        var eventPath = eventFile.fsName.toLowerCase();
        for (var i = app.notifiers.length - 1; i >= 0; i--) {
            var notifier = app.notifiers[i];
            var notifierFile = new File(notifier.eventFile);
            var notifierPath = notifierFile.fsName.toLowerCase();

            if (notifier.event === "setd" && notifierPath === eventPath) {
                return "OK:EXISTS";
            }

            if (notifier.event === "setd" &&
                    notifierPath.indexOf("com.ccd.colorpalette.cep") !== -1 &&
                    notifierPath.indexOf("foregroundchanged.jsx") !== -1) {
                notifier.remove();
            }
        }

        try {
            app.notifiers.add("setd", eventFile, charIDToTypeID("Clr "));
        } catch (classError) {
            app.notifiers.add("setd", eventFile, "Clr ");
        }

        return "OK:ADDED";
    } catch (error) {
        return "ERR:" + error;
    }
}

function colorPaletteGetCurrentTool() {
    try {
        var ref = new ActionReference();
        ref.putEnumerated(charIDToTypeID("capp"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
        return typeIDToStringID(executeActionGet(ref).getEnumerationType(stringIDToTypeID("tool")));
    } catch (actionError) {
        try {
            return String(app.currentTool);
        } catch (domError) {
            return "ERR:" + actionError + " / " + domError;
        }
    }
}
