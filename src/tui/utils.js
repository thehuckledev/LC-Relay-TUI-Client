const { exec } = require("child_process");

const colours = require("../utils/colours");

class TUIUtils {
    static chunkArray(list, chunkSize) {
        // Source - https://stackoverflow.com/a/44687374
        // Posted by Shairon Toledo, modified by community. See post 'Timeline' for change history
        // Retrieved 2026-06-01, License - CC BY-SA 4.0
        let tempList = [...list];
        return [...Array(Math.ceil(tempList.length / chunkSize))].map(_ => tempList.splice(0,chunkSize))
    };

    // Source - https://stackoverflow.com/a/58331386
    // Posted by showdev, modified by community. See post 'Timeline' for change history
    // Retrieved 2026-06-01, License - CC BY-SA 4.0
    static truncateText(text, len) {
        text = text.trim();
        return text.length > len
            ? text.slice(0, len - 3) + "..."
            : text;
    };

    static openUrl(url) {
        let openCMD = "";
        switch(process.platform) {
            case "win32":
                openCMD = `start "" "${url}"`;
                break;
            case "darwin":
                openCMD = `open "${url}"`;
                break;
            default:
                openCMD = `xdg-open "${url}"`;
                break;
        };

        exec(openCMD);
    };

    static wrapLines(lines, termWidth, padding = "   ", lineColour) {
        const maxLineWidth = termWidth - padding.length;
        const outputLines = [];

        lines.forEach((line, i) => {
            if (line.trim() === "") return outputLines.push("");

            const words = line.split(" ");
            let currentLine = "";
            for (const word of words) {
                if ((currentLine + word).length > maxLineWidth) {
                    outputLines.push(padding + lineColour + currentLine.trim() + colours.reset);
                    currentLine = "";
                };
                currentLine += word + " ";
            };
            if (currentLine) outputLines.push(padding + lineColour + currentLine.trim() + colours.reset);
        });

        return outputLines.join("\n");
    };

    static getPrintedLen(str) {
        return str.replace(/\x1b\[[0-9;]*m/g, '').length;
    };
};

module.exports = TUIUtils;