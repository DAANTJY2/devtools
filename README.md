# DevTools

A website with 138 handy tools for everyday computer work, such as a password generator, a QR code maker, a subnet calculator and converters for text, time and units.

Everything runs in your own browser. Nothing you type is sent anywhere.

You run the website on your own computer or server with **Docker**. It takes a few minutes.

---

## What you need

**Docker.** Docker runs software in a sealed-off "box", so you don't have to install anything else.

- **Windows or Mac:** download and install [Docker Desktop](https://www.docker.com/products/docker-desktop/). Start it once and wait until it's ready (the whale icon in your taskbar or menu bar stops moving).
- **Linux:** follow the [Docker Engine install guide](https://docs.docker.com/engine/install/).

Check that it works. Open a terminal (Windows: *PowerShell*, Mac: *Terminal*) and type:

```sh
docker --version
```

If you see a version number, you're ready for the next step.

---

## Installation

### 1. Download the files

Pick one of these two ways:

- **Without Git:** at the top of this GitHub page, click the green **Code** button, then **Download ZIP**. Unzip the file somewhere, for example in your *Documents* folder.
- **With Git:**
  ```sh
  git clone https://github.com/DAANTJY2/devtools.git
  ```

### 2. Go to the folder

In the terminal, type `cd` followed by a space, then drag the unzipped folder into the terminal window. Press Enter.

```sh
cd devtools
```

### 3. Build and start the website

```sh
docker compose up -d --build
```

Docker builds a small Nginx image containing the website and starts it. This can take a moment the first time.

### 4. Open the website

In your browser, go to **<http://localhost:8091>**.

That's it. From now on the website starts by itself whenever Docker is running, even after you restart your computer.

---

## Everyday use

Always run these commands inside the `devtools` folder.

| What do you want to do? | Command |
|---|---|
| Stop the website | `docker compose down` |
| Start it again | `docker compose up -d` |
| Check whether it's running | `docker compose ps` |
| See the web server's messages | `docker compose logs` |

### Updating to a new version

- **With Git:** run `git pull`, then `docker compose up -d --build`.
- **With the ZIP:** download the new ZIP, replace the old folder and start again with `docker compose up -d --build`.

Your favorites are kept, because they are stored in your browser.

---

## Settings

### Using a different port

Is port 8091 already taken, or do you want another number? Open `docker-compose.yml` in a text editor and change the first number:

```yaml
    ports:
      - "8091:80"   # change 8091 to, for example, 9000
```

Save the file and run `docker compose up -d`. The website is then at `http://localhost:9000`.

### Making it available to others

If Docker runs on a server, other people can reach the website at `http://<server-address>:8091`.

If you make it reachable over the internet, we recommend **HTTPS**. Put a reverse proxy in front of the website, such as Caddy, Traefik or Nginx Proxy Manager. A few tools only work over HTTPS (or on `localhost`), because browsers require it: the RSA key generator, the CSR generator, RSA-OAEP and the camera. All other tools also work over plain HTTP.

---

## Troubleshooting

**"docker: command not found" or "docker is not recognized"**
Docker isn't installed, or Docker Desktop hasn't been started yet. Start Docker Desktop and try again.

**"port is already allocated" or "address already in use"**
Another program is already using port 8091. Pick a different port (see *Using a different port*).

**The page doesn't load**
Check with `docker compose ps` that the container is running. If nothing is listed, start it again with `docker compose up -d` and look for errors with `docker compose logs`.

**I still see the old version**
Reload the page without the cache: <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd> (Mac: <kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd>).

---

## Good to know

- **Private:** the tools do all their work in your browser. There is no database, and nothing is sent to a server.
- **Lightweight:** the container is a small web server with the website files built into its image.
- **Secure defaults:** the web server sends security headers. The settings are in the `deploy/` folder.
