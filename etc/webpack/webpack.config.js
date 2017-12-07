import "../scripts/init-scripts"
import {makeConfig, makeHotEntry} from "./make-webpack-config"
import HtmlWebpackPlugin from 'html-webpack-plugin'

module.exports = makeConfig('annotator-app', [], {
    "annotator-entry-main": makeHotEntry([
        "./annotator-entry-main/MainEntry"
    ]),
    "annotator-entry-ui": makeHotEntry([
        "./annotator-entry-ui/index"
    ]),
}, config => {
    config.plugins.unshift(
        new HtmlWebpackPlugin({
            filename: "browser-entry.html",
            template: `${process.cwd()}/packages/annotator-assets/templates/BrowserEntry.jade`,
            inject: false,
            isDev
        })
    )
})
