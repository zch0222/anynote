/** @type {import('next').NextConfig} */
const path = require('path')
const nextConfig = {
    typescript:{
        ignoreBuildErrors:true
    },
    sassOptions: {
        includePaths: [path.join(__dirname, 'styles')],
    },
    webpack: (config) => {
        config.module.rules.unshift({
            test: /pdf\.worker\.(min\.)?js/,
            use: [
                {
                    loader: "file-loader",
                    options: {
                        name: "[contenthash].[ext]",
                        publicPath: "_next/static/worker",
                        outputPath: "static/worker"
                    }
                }
            ]
        });
        config.module.rules.push({
            test: /\.node$/,
            use: 'node-loader'
        })
        return config;
    }
}

module.exports = nextConfig
