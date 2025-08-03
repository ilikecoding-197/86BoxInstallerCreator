# 86BoxInstallerCreator - A creator for 86Box installers
Are you tired of manually download all of the files for 86Box, having to put them all in one file, make shortcuts, etc etc? Have you ever wanted to just run a single executable and have 86Box installed? No? Well either way here it is!

Note: only works for Windows.

## How to use
Now really you don't exactly need to create your own installer if you don't want to have custom versions. If you just want the latest versions, you can get pre-complied installers from the Releases. However, if you do want custom versions, follow these steps.

### Step 1. Install Node
Either use a version manager like Nodist or manually install Node, whatever you perfer. Search it up.

### Step 2. Get the source.
Either download the .zip of this repo, or, if you have git installed, clone it.

### Step 3. Install packages
Simply, open a terminal in the folder containing the source and run `npm install`.

### Step 4. Run!
Now just launch the main file with `node index.mjs`! There are some options. Run `node index.mjs --help` to see them. All you need to know is that you have to use `node index.mjs -l` to use latest versions (really, if yoiu need that, use releases), and `node index.mjs -c` to cleanup files from other runs.

In the tool, if you didn't provide `-l`, you can specfiy your custom versions there. The tool will download them, extract them, and create the final exectable.

Now, just use that created file. Upload it to releases if youre a dev of this project, upload it somewhere else (MAKE SURE TO CREDIT THIS TOOL! Well, you don't have to but the license will tell the users). Dont make it a paid setup file.