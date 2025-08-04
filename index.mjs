import chalk from 'chalk';
import readline from 'readline';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import axios from 'axios';
import fs from 'graceful-fs';
import https from 'https';
import ProgressBar from 'progress';
import ora from 'ora';
import unzipper from 'unzipper';
import path from 'path';
import extraFs from 'fs-extra';
import { spawn } from 'node:child_process';
import http from 'http';

async function ask(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    question = chalk.blue(question);

    return new Promise(resolve => rl.question(question, answer => {
        rl.close();
        resolve(answer);
    }));
}

async function askYesNo(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    question = chalk.blue(question);

    return new Promise((resolve) => {
        rl.question(`${question} (Y/n): `, (answer) => {
            rl.close();
            answer = answer.trim().toLowerCase();
            resolve(!(answer === "n" || answer === "no"));
        });
    });
}

function intro() {
    console.log(chalk.green.bold("86Box Installer Creator"));
    console.log("Created by " + chalk.blue("ilikecoding-197") + " on GitHub.");
    console.log(chalk.green("Hope you enjoy!"));
}

async function getVersions() {
    async function getVersion(name) {
        const answer = await ask(`Version of ${chalk.blue(name)} [latest]: `);
        return answer || "latest";
    }

    console.log("\nVersions:");
    let out = {
        emu: await getVersion("86Box"),
        manager: await getVersion("86Box Manager")
    };

    const answer = await ask(`Version of ${chalk.blue("86Box ROMS")} [enter nothing for same version as 86Box]: `);
    if (answer == "") out.roms = out.emu;
    else out.roms = answer;

    return out;
}

function getArgs() {
    const argv = yargs(hideBin(process.argv))
        .option("latest", {
            alias: "l",
            type: "boolean",
            description: "Use latest versions"
        })
        .option("clean", {
            alias: "c",
            type: "boolean",
            description: "Instead of normal operation, delete files from a run. Will also delete files from the middle of a run (in case of a error)."
        })
        .option("verbose", {
            alias: "v",
            type: "boolean",
            description: "Verbose mode - currently only have the Inno Setup Compiler output more info."
        })
        .argv;

    return argv;
}

function releasesListUrl(owner, repo) {
    if (repo == undefined) repo = owner;
    return `https://api.github.com/repos/${owner}/${repo}/releases`
}

function releaseLatestUrl(owner, repo) {
    if (repo == undefined) repo = owner;
    return `https://api.github.com/repos/${owner}/${repo}/releases/latest`
}

function releaseFromTagUrl(owner, repo, tag) {
    return `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`
}

function releasesList(owner, repo) {
    return axios.get(releasesListUrl(owner, repo))
        .then(res => res.data)
        .catch(err => null);
}

function releaseLatest(owner, repo) {
    return axios.get(releaseLatestUrl(owner, repo))
        .then(res => res.data)
        .catch(err => null);
}

function releaseFromTag(owner, repo, tag) {
    return axios.get(releaseFromTagUrl(owner, repo))
        .then(res => res.data)
        .catch(err => null);
}

function downloadWithProgress(url, outputPath, downloadText = "Downloading", maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        if (maxRedirects < 0) {
            return reject(new Error('Too many redirects'));
        }

        const urlObj = new URL(url);
        const lib = urlObj.protocol === 'https:' ? https : http;
        const file = fs.createWriteStream(outputPath);

        const req = lib.get(url, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
                file.close();
                const location = res.headers.location;
                if (!location) return reject(new Error(`Redirect with no location`));
                const redirectUrl = new URL(location, url).toString();
                return resolve(downloadWithProgress(redirectUrl, outputPath, downloadText, maxRedirects - 1));
            }

            if (res.statusCode !== 200) {
                file.close();
                return reject(new Error(`Failed with status code ${res.statusCode}`));
            }

            const total = parseInt(res.headers['content-length'], 10);
            const hasLength = !isNaN(total) && total > 0;

            let bar;
            let spinner;
            if (hasLength) {
                bar = new ProgressBar(`${downloadText} [:bar] :percent :etas`, {
                    width: 40,
                    complete: '=',
                    incomplete: ' ',
                    clear: true,
                    total,
                });
            } else {
                spinner = ora(downloadText).start();
            }

            res.on('data', (chunk) => {
                file.write(chunk);
                if (bar) bar.tick(chunk.length);
            });

            res.on('end', () => {
                file.end();
                if (spinner) spinner.stop();
                resolve();
            });

            res.on('error', (err) => {
                file.close();
                if (spinner) spinner.fail();
                reject(err);
            });
        });

        req.on('error', (err) => {
            file.close();
            reject(err);
        });

        file.on('error', (err) => {
            reject(err);
        });
    });
}


const args = getArgs();
(async () => {
    intro();

    if (args.clean) {
        function deleteIfExists(file) {
            if (fs.existsSync(file)) {
                fs.rmSync(file, { "recursive": true, "force": true });
            }
        }

        let toDelete = [
            "roms", "manager", "emu",
            "roms.zip", "manager.zip", "emu.zip",
            "output"
        ];

        toDelete.forEach(deleteIfExists);

        fs.readdirSync(".").forEach((file) => {
            if (/86Box-.*/.test(file)) fs.rmSync(file);
        })

        console.log(chalk.green("Files cleaned."));
        process.exit(0);
    }

    const innoSetupExe = "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe";
    if (!fs.existsSync(innoSetupExe)) {
        console.error("It doesn't seem you have the Inno Setup Compiler installed. If you do, please make a issue. Otherwise, install it. Can not continue.");
        process.exit(1);
    }

    let versions;
    if (args.latest) {

        console.log("\n" + chalk.green("Creating..."))
        versions = {
            emu: "latest", manager: "latest", roms: "latest"
        };
        console.log("\nUsing " + chalk.blue("latest") + " for all versions, from command line.");
    } else {
        while (true) {
            versions = await getVersions();
            console.log("\nYou chose: ");

            function printVersion(key, name) {
                let version = versions[key];
                console.log(chalk.green(name) + ": " + chalk.blue(version))
            }

            printVersion("emu", "86Box");
            printVersion("manager", "86Box Manager");
            printVersion("roms", "86Box ROMs");

            if (await askYesNo("Is that correct?")) {
                break;
            }
        }

        console.log(chalk.green("\nCreating...\n"))
    }

    let arch = process.arch;
    if (arch == "x64") arch = "64";
    else if (arch == "ia32") arch = "32";
    else {
        console.error("Unsupported arch, must be 64bit or 32bit.");
    }
    console.log("Using " + chalk.blue(arch + "-bit") + " for downloads.\n");

    let emuRelease = versions.emu == "latest" ? await releaseLatest("86Box") : await releaseFromTag("86Box", "86Box", "v" + versions.emu);
    let romsRelease = versions.roms == "latest" ? await releaseLatest("86Box", "roms") : await releaseFromTag("86Box", "roms", "v" + versions.roms);
    let managerRelease = versions.manager == "latest" ? await releaseLatest("86Box", "86BoxManager") : await releaseFromTag("86Box", "86BoxManager", versions.manager);

    if (emuRelease == null) {
        console.error("Could not get release for emulator, can not continue.");
        process.exit(1);
    }

    if (romsRelease == null) {
        console.error("Could not get release for roms, can not continue.");
        process.exit(1);
    }

    if (managerRelease == null) {
        console.error("Could not get release for manager, can not continue.");
        process.exit(1);
    }

    const emu32Regex = /86Box-Windows-32-b\d*\.zip/;
    const emu64Regex = /86Box-Windows-64-b\d*\.zip/;
    const emuRegex = arch == "32" ? emu32Regex : emu64Regex;
    let emuUrl;
    for (let i = 0; i < emuRelease.assets.length; i++) {
        const asset = emuRelease.assets[i];
        if (emuRegex.test(asset.name)) {
            emuUrl = asset.browser_download_url; break;
        }
    }

    const romsTag = romsRelease.tag_name;
    const romsUrl = `https://github.com/86Box/roms/archive/refs/tags/${romsTag}.zip`;

    let managerUrl = managerRelease.assets[0].browser_download_url;

    async function download(url, file, name) {
        if (fs.existsSync(file)) {
            return new Promise((resolve) => {
                console.log("Not downloading " + chalk.blue(name) + ", it already exists. (use --clean if you want to do from scratch)");
                resolve();
            });
        }

        return downloadWithProgress(url, file, "Downloading " + chalk.blue(name));
    }

    await download(emuUrl, "emu.zip", "86Box");
    await download(romsUrl, "roms.zip", "86Box ROMs");
    await download(managerUrl, "manager.zip", "86Box Manager");

    async function extract(file, dir, name) {
        const directory = await unzipper.Open.file(file);
        const bar = new ProgressBar(`Extracting ${chalk.blue(name)} [:bar] :percent :etas`, {
            total: directory.files.length,
            width: 40,
            complete: '=',
            incomplete: ' ',
            clear: true,
        });

        await Promise.all(directory.files.map(async (entry) => {
            const fullPath = path.join(dir, entry.path);

            if (entry.type === 'Directory') {
                fs.mkdirSync(fullPath, { recursive: true });
            } else {
                // Ensure parent directory exists
                fs.mkdirSync(path.dirname(fullPath), { recursive: true });

                const readStream = entry.stream();
                const writeStream = fs.createWriteStream(fullPath);
                await new Promise((resolve, reject) => {
                    readStream.pipe(writeStream);
                    writeStream.on('close', resolve);
                    writeStream.on('error', reject);
                    readStream.on('error', reject);
                });
            }

            bar.tick();
        }));
    }
    await extract("emu.zip", "emu", "86Box");
    await extract("roms.zip", "roms", "86Box ROMs");
    await extract("manager.zip", "manager", "86Box Manager");

    const romDir = "roms/roms-" + romsTag.slice(1);
    const cleanupDeleteFiles = [
        "manager/AUTHORS", "manager/LICENSE", "manager/README.md",
        romDir + "/.github", romDir + "/LICENSE", romDir + "/README.md"
    ];
    const cleanupBar = new ProgressBar(chalk.blue("Cleanup") + " [:bar] :percent", {
        width: 40,
        complete: '=',
        incomplete: ' ',
        clear: true,
        total: cleanupDeleteFiles.length
    });

    cleanupDeleteFiles.forEach((file) => {
        fs.rmSync(file, { recursive: true, force: true });
        cleanupBar.tick();
    });

    const outputBar = new ProgressBar(chalk.blue("Generating output folder") + " [:bar] :percent", {
        width: 40,
        complete: '=',
        incomplete: ' ',
        clear: true,
        total: 5
    });
    fs.mkdirSync("output"); outputBar.tick();

    function move(src, dest, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                extraFs.moveSync(src, dest, { overwrite: true });
                fs.rmSync(src, { recursive: true, force: true });
                outputBar.tick();
                return;
            } catch (err) {
                if (err.code === "EBUSY" && i < retries - 1) {
                    console.warn(`EBUSY on move: retrying in 500ms (${i + 1}/${retries})`);
                    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500); // sleep
                } else {
                    throw err;
                }
            }
        }
    }


    function moveAllFiles(srcFolder, dest, retries = 3) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }

        const files = fs.readdirSync(srcFolder);

        files.forEach((file) => {
            const srcPath = path.join(srcFolder, file);
            const destPath = path.join(dest, file);

            for (let i = 0; i < retries; i++) {
                try {
                    extraFs.moveSync(srcPath, destPath, { overwrite: true });
                    break; // success, exit retry loop
                } catch (err) {
                    if (i < retries - 1 && (err.code === "EBUSY" || err.code === "EPERM")) {
                        console.warn(`Failed to move ${file} (${err.code}), retrying in 300ms...`);
                        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300); // sleep
                    } else {
                        console.error(`Failed to move ${file}:`, err);
                        throw err;
                    }
                }
            }
        });

        // Clean up source folder after move
        try {
            fs.rmSync(srcFolder, { recursive: true, force: true });
        } catch (err) {
            console.warn(`Could not delete source folder ${srcFolder}:`, err.message);
        }

        outputBar.tick();
    }



    function copyAllFiles(srcFolder, dest) {
        fs.readdirSync(srcFolder).forEach((file) => {
            const fullPath = path.join(srcFolder, file);

            extraFs.copySync(fullPath, path.join(dest, file));
        })
        outputBar.tick();
    }

    move(romDir, "output/roms");
    fs.rmSync("roms", { recursive: true, force: true })
    moveAllFiles("manager", "output");
    moveAllFiles("emu", "output");
    copyAllFiles("setupFiles", "output");

    console.log(chalk.green("Generating final setup..."));

    let installerVersion = versions.emu == "latest" ? emuRelease.tag_name : "v" + versions.emu;
    const installerFileName = "86Box-" + installerVersion

    let innoArgs = [
        "/O.",
        "/F\"" + installerFileName + "\"",
        "/DMyAppVersion=" + installerVersion.slice(1),
        "\"output\\install.iss\""
    ]
    if (!args.verbose) innoArgs.push("/Qp");

    const inno = spawn('"' + innoSetupExe + '"', innoArgs, {
        shell: true,
        stdio: "inherit"
    });

    inno.on('close', (code) => {
        readline.moveCursor(process.stdout, 0, -1);
        console.log(chalk.green("Done! You can find the output executable in the current directory, " + installerFileName + ".exe."));
        process.exit(0);
    });
})();
