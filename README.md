# Extensions for Draw.IO

## Draw.io Graph Generation Using YaNa API

YaNa.js is a plugin extension for Draw.io (also known as Diagrams.net) that allows you to create basic network graphs by fetching data using the YaNa REST API. This plugin simplifies the process of visualizing network topologies and connections directly within the Draw.io interface.

### Getting Started

#### Important Notes

- Use **Draw.io v24.7.1** or higher.
- Since plugins are disabled in the browser version of Draw.io, download the desktop version directly from [Draw.io v24.7.17 Release](https://github.com/jgraph/drawio/releases/tag/v24.7.17).

#### Pre-Configuration Details

To enable the desired functionalities, modify the `PreConfig.js` and `PostConfig.js` files.

- **PreConfig.js** (`/src/main/webapp/js/PreConfig.js`):
  ```javascript
  // Enable custom plugins
  window.ALLOW_CUSTOM_PLUGINS = true;

  // Plugins are usually enabled by default, but you can force activation if needed
  urlParams['offline'] = 0;
  ```

- **PostConfig.js** (`/src/main/webapp/js/PostConfig.js`):
  ```javascript
  // Register plugins
  window.App.pluginRegistry.yana = 'js/yana.js';

  // Initialize and load plugins
  App.initPluginCallback();
  App.loadPlugins(['yana']);
  ```

#### Plugin Loading Methods

1. **Inconditional Loading via PostConfig:**  
   The plugin can be loaded unconditionally by declaring it in `PostConfig.js` as shown in the above example.
   
2. **On-Demand Loading via URL Parameter:**  
   You can load a plugin on-demand by passing the plugin's ID via the URL:  
   `?plugins=1&p=<plugin-id>`. The plugin must be declared in `App.pluginRegistry` beforehand.

3. **Custom Plugin Mode:**  
   To load a custom plugin, the following steps should be followed:
   - **Set `window.ALLOW_CUSTOM_PLUGINS = true;`** to enable the custom plugin loading feature.
   - **Ensure `offline` is not set to `0`** for the plugin to load correctly in custom mode.

### Features of the YaNa.js Plugin

- **Base API Selection:** Set the base API URL (must be HTTPS) from which the plugin will fetch network data.
- **Entity Selection:** Choose an entity (like a specific network or device group) to visualize its devices and links.
- **Graph Visualization:** Generate and display a network graph using the data fetched from the API.
- **Re-update Graph:** Refresh the graph with the latest data from the selected entity.
- **Reset Graph:** Clear the current graph and selections.
- **Force Layout:** Apply an organic layout to visually organize the network devices and links.

### Plugin Workflow

1. **Select the Base API:**
   The plugin will prompt you to enter the URL of the base API. This is the endpoint that provides the network data.

2. **Select an Entity:**
   Once the base API is set, the plugin will allow you to choose an entity (such as a network or device group) from the available options.

3. **Load and View the Graph:**
   After selecting an entity, the plugin will retrieve the device and link information, and draw the corresponding network graph in Draw.io.

4. **Update or Reset the Graph:**
   You can update the graph to fetch the latest data or reset the graph to start fresh.

5. **Layout the Graph:**
   The plugin can apply an organic layout to the graph to arrange the devices and links in a visually appealing manner.

### Troubleshooting

- **Plugin Not Loading:** Ensure that the URL entered for the YaNa.js plugin is correct and that the plugin is hosted correctly. Try refreshing the page if it does not load after adding the plugin.
- **API Issues:** If the plugin cannot fetch data, verify the YaNa API is online and accessible. Make sure the base URL is correctly configured.