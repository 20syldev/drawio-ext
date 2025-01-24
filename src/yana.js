/** 
 * Draw.io plugin for generating network graphs using YaNa API
 * This plugin allows users to fetch network data from the YaNa API
 * and visualize it as a graph in the Draw.io editor.
 */
Draw.loadPlugin(function (ui) {
    const graph = ui.editor.graph;      // Initialize the graph object
    const toolbar = ui.toolbar;         // Initialize the toolbar
    let baseAPI = '', yanaEntity = '';  // Initialize base API and entity variables

    /**
     * Await the completion of the graph editor initialization.
     * Then add a listener to update the base API and entity variables
     */
    graph.getModel().addListener(mxEvent.NOTIFY, function() {
        const cells = graph.getModel().getChildren(graph.getModel().getRoot());
        cells.forEach(cell => {
            const value = cell.getValue();
            if (value && value.nodeName === 'object') {
                baseAPI = value.getAttribute('base-api')?.replace(/\/$/, '') || '';
                yanaEntity = value.getAttribute('yana-entity')?.replace(/\/$/, '') || '';
                console.log('Base API:', baseAPI, 'Entity:', yanaEntity);
            }
        });
    });

    /**
     * Add custom menu items to the toolbar.
     * 
     * @param {string} label - The label of the menu item to be added.
     * @param {string} title - The title or description of the menu item.
     * @param {boolean} enabled - Flag to determine if the menu item is enabled or not.
     * @param {Function} callback - The callback function to execute when the menu item is clicked.
     * @param {HTMLElement} container - The container to add the menu item to.
     */
    toolbar.addMenuFunction('Select Base API', 'Select the base API to fetch data', true, () => selectBaseAPI(), toolbar.container);
    toolbar.addMenuFunction('Select Entity', 'Select entity and load graph', true, () => selectEntity(loadGraph), toolbar.container);
    toolbar.addMenuFunction('Load', 'Load graph', true, loadGraph, toolbar.container);
    toolbar.addMenuFunction('Re-update', 'Update graph', true, updateGraph, toolbar.container);
    toolbar.addMenuFunction('Reset', 'Reset graph', true, resetGraph, toolbar.container);
    toolbar.addMenuFunction('Force Layout', 'Apply layout to non-movable & movable elements', true, () => organicLayout(graph), toolbar.container);

    /**
     * Opens a popup to enter a base API URL (must be HTTPS), validates it, and saves it as a custom property.
     * This function prompts the user to enter a base API URL.
     * 
     * @param {function} callback - A callback function to be called with the base API URL after it's validated and set.
     */
    function selectBaseAPI(callback) {
        const popup = new mxWindow('Select Base API', document.createElement('div'), 300, 300, 300, 120, true, true);
        const input = document.createElement('input');
        input.type = 'text';
        input.value = baseAPI;
        input.placeholder = 'Enter API base URL (must be HTTPS)';
        input.style.width = '100%';

        const validateBtn = document.createElement('button');
        validateBtn.textContent = 'Validate';
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';

        validateBtn.onclick = () => {
            baseAPI = input.value.trim();
            const obj = mxUtils.createXmlDocument().createElement('object');
            let parent = graph.getModel().getValue(graph.getDefaultParent());

            if (parent) {
                if (!parent.getAttribute('base-api') || parent.getAttribute('base-api') !== baseAPI) {
                    parent.setAttribute('base-api', baseAPI);
                }
            } else {
                obj.setAttribute('base-api', baseAPI);
                graph.getModel().setValue(graph.getDefaultParent(), obj);
            }

            if (!baseAPI) return alert('Please enter a valid base API URL.');
            popup.destroy();

            if (callback) callback(baseAPI);
        };

        cancelBtn.onclick = () => {
            popup.destroy();
        };

        const content = popup.content;
        content.appendChild(input);
        content.appendChild(validateBtn);
        content.appendChild(cancelBtn);
        popup.setVisible(true);
    }

    /**
     * Select an entity from a list, load its related data, and save it as a custom property.
     * This function fetches a list of entities from the base API and allows the user to select one.
     * 
     * @param {function} callback - A callback function to be called after the entity is selected and saved.
     */
    function selectEntity(callback) {
        if (!baseAPI) {
            alert('Please select a base API first.');
            return;
        }

        fetch(`${baseAPI}/entities`)
            .then(res => res.json())
            .then(entities => {
                const popup = new mxWindow('Select Entity', document.createElement('div'), 300, 300, 250, 80, true, true);
                const select = document.createElement('select');
                entities.forEach(entity => {
                    const option = document.createElement('option');
                    option.value = entity;
                    option.textContent = entity;
                    select.appendChild(option);
                });

                const validateBtn = document.createElement('button');
                validateBtn.textContent = 'Validate';
                validateBtn.onclick = () => {
                    yanaEntity = select.value;
                    const obj = mxUtils.createXmlDocument().createElement('object');
                    let parent = graph.getModel().getValue(graph.getDefaultParent());

                    if (parent) {
                        if (!parent.getAttribute('yana-entity') || parent.getAttribute('yana-entity') !== yanaEntity) {
                            parent.setAttribute('yana-entity', yanaEntity);
                        }
                    } else {
                        obj.setAttribute('yana-entity', yanaEntity);
                        graph.getModel().setValue(graph.getDefaultParent(), obj);
                    }

                    popup.destroy();
                    if (callback) callback();
                };

                const cancelBtn = document.createElement('button');
                cancelBtn.textContent = 'Cancel';
                cancelBtn.onclick = () => popup.destroy();

                const content = popup.content;
                content.appendChild(select);
                content.appendChild(validateBtn);
                content.appendChild(cancelBtn);
                popup.setVisible(true);
            })
            .catch(err => console.error('Error fetching entities:', err) && alert('Error fetching entities.'));
    }

    /**
     * Fetch data for devices and links related to the selected entity.
     * This function makes two API calls to retrieve device and link information.
     * It processes the data and returns it in a usable format.
     * 
     * @returns {Promise<{devices: Array, links: Array, deviceConnections: Object}>} - A promise that resolves to an object containing:
     *    - devices: An array of devices related to the selected entity.
     *    - links: An array of formatted links connecting devices.
     *    - deviceConnections: An object mapping device IDs to the number of connections they have.
     */
    async function fetchData() {
        if (!baseAPI || !yanaEntity) {
            alert('Please select both a base API and an entity.');
            return { devices: [], links: [], deviceConnections: {} };
        }

        const apiDevices = `${baseAPI}/entity/${yanaEntity}/devices?q=switch`;
        const apiLinks = `${baseAPI}/entity/${yanaEntity}/dump?table=snei`;

        console.log('Fetching data from:', apiDevices, apiLinks);

        try {
            const formattedLinks = [];
            const [devices, links] = await Promise.all([
                fetch(apiDevices).then(res => res.json()),
                fetch(apiLinks).then(res => res.json())
            ]);

            const switches = devices.reduce((acc, device) => {
                if (device.id && device.iface) {
                    acc[device.id] = device.iface;
                }
                return acc;
            }, {});

            const deviceConnections = devices.reduce((acc, device) => {
                acc[device.id] = 0;
                return acc;
            }, {});

            Object.entries(links).forEach(([switchId, ports]) => {
                Object.entries(ports).forEach(([port, portLinks]) => {
                    portLinks.forEach(link => {
                        if (link.id !== switchId) {
                            const targetIface = switches[link.id] ? switches[link.id][link.ifname] : null;

                            if (targetIface) {
                                const speed = targetIface.speed || 0;
                                const duplex = targetIface.duplex || 0;

                                formattedLinks.push({
                                    sourceId: switchId,
                                    targetId: link.id,
                                    sourcePort: port,
                                    targetPort: link.ifname,
                                    speed: speed,
                                    duplex: duplex
                                });

                                deviceConnections[switchId]++;
                                deviceConnections[link.id]++;
                            }
                        }
                    });
                });
            });

            return { devices, links: formattedLinks, deviceConnections };
        } catch (err) {
            console.error('Error fetching graph data:', err);
            alert('Error fetching graph data.');
            return { devices: [], links: [], deviceConnections: {} };
        }
    }

    /**
     * Load the graph data based on the selected entity.
     * This function retrieves devices and links related to the selected entity 
     * and then constructs the graph elements (devices and links).
     * 
     * @throws {Error} If there is an error fetching or processing the graph data.
     */
    function loadGraph() {
        if (!yanaEntity || !baseAPI) return alert('Please select both a base API and an entity.');
        fetchData().then(({ devices, links, deviceConnections }) => {
            const parent = graph.getDefaultParent();
            graph.getModel().beginUpdate();
            try {
                const switchMap = createDevices(graph, parent, devices, deviceConnections);
                createLinks(graph, parent, switchMap, links);
            } finally {
                organicLayout(graph);
                graph.getModel().endUpdate();
            }
        }).catch(console.error);
    }

    /**
     * Update the graph with the latest data from the selected entity.
     * This function fetches the latest devices and links, 
     * then updates the graph elements with the new data.
     * 
     * @throws {Error} If there is an error fetching or processing the graph data.
     */
    function updateGraph() {
        if (!yanaEntity || !baseAPI) return alert('Please select both a base API and an entity.');

        graph.cellsMovable = false;
        fetchData().then(({ devices, links, deviceConnections }) => {
            const parent = graph.getDefaultParent();
            graph.getModel().beginUpdate();
            try {
                const switchMap = createDevices(graph, parent, devices, deviceConnections);
                updateDevices(graph, switchMap, devices);
                updateLinks(graph, parent, switchMap, links);
            } finally {
                graph.getModel().endUpdate();
            }
            organicLayout(graph);
            graph.cellsMovable = true;
        }).catch(console.error);
    }

    /**
     * Reset the graph (clear everything).
     * This function resets the graph, clearing any existing cells and entity selections.
     * 
     * @throws {Error} If there is an error while clearing the graph.
     */
    function resetGraph() {
        yanaEntity = null;
        graph.getModel().beginUpdate();
        try { graph.getModel().clear(); }
        finally { graph.getModel().endUpdate(); }
    }

    /**
     * Create device elements in the graph.
     * This function creates device vertices for each device in the provided data.
     * It sets device names, IPs, and other properties based on the provided data.
     * 
     * @param {mxGraph} graph - The graph object where the devices will be created.
     * @param {mxCell} parent - The parent cell to which the devices will be added.
     * @param {Array} devices - The array of device data used to create the devices in the graph.
     * @param {Object} [deviceConnections={}] - An optional object that maps device IDs to their connection count (default is empty).
     * 
     * @returns {Object} switchMap - A map where each key is a device ID and each value is the corresponding device vertex in the graph.
     */
    function createDevices(graph, parent, devices, deviceConnections = {}) {
        const switchMap = {};
        devices.forEach(device => {
            if (!graph.getModel().getCell(device.id)) {
                const connectionCount = deviceConnections[device.id];
                const fontSize = Math.min(8 + connectionCount * 0.25, 20);

                const name = device.name?.[0]?.split('.')[0] || 'Undefined';
                const ip = device.ip?.[0] ? `\n${device.ip[0]}` : 'Undefined';

                const text = `${name}${ip}`;
                const height = Math.min(12 + connectionCount, 40);
                const width = document.createElement('canvas').getContext('2d').measureText(text).width;

                const switchVertex = graph.insertVertex(
                    parent,
                    device.id,
                    text,
                    0,
                    0,
                    width + fontSize,
                    height + fontSize,
                    `fontSize=${fontSize};auto-created=true;`
                );
                switchMap[device.id] = switchVertex;
            }
        });
        return switchMap;
    }

    /**
     * Update device information in the graph.
     * This function updates the text and geometry of the device vertices 
     * based on the updated device data.
     * 
     * @param {mxGraph} graph - The graph object containing the devices to update.
     * @param {Object} switchMap - A map where each key is a device ID and each value is the corresponding device vertex.
     * @param {Array} devices - The array of updated device data used to update the devices in the graph.
     */
    function updateDevices(graph, switchMap, devices) {
        devices.forEach(device => {
            const switchVertex = graph.getModel().getCell(device.id);
            if (switchVertex) {
                switchVertex.value = `${device.name}\n${device.ip[0]}`;
                if (!switchVertex.geometry) switchVertex.setGeometry(new mxGeometry(0, 0, 100, 40));
            }
            switchMap[device.id] = switchVertex;
        });
    }

    /**
     * Create link edges between devices in the graph.
     * This function creates edges between device vertices based on the link data provided.
     * It adds speed and duplex information to each link edge.
     * 
     * @param {mxGraph} graph - The graph object where the link edges will be created.
     * @param {mxCell} parent - The parent cell to which the edges will be added.
     * @param {Object} switchMap - A map where each key is a device ID and each value is the corresponding device vertex.
     * @param {Array} links - An array of link data used to create edges between devices.
     */
    function createLinks(graph, parent, switchMap, links) {
        const processedLinks = new Set();
        links.forEach(link => {
            const linkKey = `${link.sourceId}-${link.targetId}`;
            const reverseLinkKey = `${link.targetId}-${link.sourceId}`;
            if (!processedLinks.has(linkKey) && !processedLinks.has(reverseLinkKey)) {
                const sourceSwitch = switchMap[link.sourceId];
                const targetSwitch = switchMap[link.targetId];
                if (sourceSwitch && targetSwitch) {
                    const edge = graph.insertEdge(
                        parent,
                        null,
                        null,
                        sourceSwitch,
                        targetSwitch,
                        getLinkStyle(link.speed, link.duplex)
                    );
                    addPortLabels(graph, edge, link.sourcePort, link.targetPort, linkKey);
                    processedLinks.add(linkKey);
                }
            }
        });
    }

    /**
     * Update the links in the graph.
     * This function removes existing link edges and creates new edges based on updated link data.
     * 
     * @param {mxGraph} graph - The graph object where the links will be updated.
     * @param {mxCell} parent - The parent cell to which the new links will be added.
     * @param {Object} switchMap - A map where each key is a device ID and each value is the corresponding device vertex.
     * @param {Array} links - An array of updated link data used to update the links between devices.
     */
    function updateLinks(graph, parent, switchMap, links) {
        const existingEdges = graph.getModel().getCells().filter(cell => graph.getModel().isEdge(cell));
        existingEdges.forEach(edge => graph.removeCells([edge]));
        createLinks(graph, parent, switchMap, links);
    }

    /**
     * Get the style for a link (edge) based on speed and duplex mode.
     * This function returns a string representing the style of the link 
     * based on the link's speed and duplex properties.
     * 
     * @param {number} speed - The speed of the link (in bits per second).
     * @param {number} duplex - The duplex mode of the link (1 for half-duplex, 2 for full-duplex).
     * 
     * @returns {string} style - The style string to apply to the link (edge) based on speed and duplex.
     */
    function getLinkStyle(speed, duplex) {
        return duplex === 2 || speed < 1000000000
            ? 'html=1;rounded=0;fontSize=0;labelBackgroundColor=default;strokeColor=red;endArrow=none;auto-created=true;'
            : 'html=1;rounded=0;fontSize=0;labelBackgroundColor=default;strokeColor=black;endArrow=none;auto-created=true;';
    }

    /**
     * Add port labels to the edges (links) between devices.
     * This function adds labels to the edges to indicate the source and target ports for each link.
     * 
     * @param {mxGraph} graph - The graph object in which the edge labels will be added.
     * @param {mxCell} edge - The edge (link) to which the labels will be added.
     * @param {string} sourcePort - The source port label to display on the edge.
     * @param {string} targetPort - The target port label to display on the edge.
     * @param {string} linkKey - A unique key identifying the link (used to differentiate source and target labels).
     */
    function addPortLabels(graph, edge, sourcePort, targetPort, linkKey) {
        const existingSourceLabel = graph.getModel().getCell(`${linkKey}-source`);
        const existingTargetLabel = graph.getModel().getCell(`${linkKey}-target`);

        if (!existingSourceLabel) {
            const sourceLabel = new mxCell(
                sourcePort,
                new mxGeometry(-0.5, -0.5, 0, 0),
                'edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];fontSize=8;labelBackgroundColor=white;labelBorderColor=white;'
            );
            sourceLabel.vertex = true;
            sourceLabel.geometry.relative = true;
            sourceLabel.id = `${linkKey}-source`;
            graph.addCell(sourceLabel, edge);
        }

        if (!existingTargetLabel) {
            const targetLabel = new mxCell(
                targetPort,
                new mxGeometry(0.5, 0.5, 0, 0),
                'edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];fontSize=8;labelBackgroundColor=white;labelBorderColor=white;'
            );
            targetLabel.vertex = true;
            targetLabel.geometry.relative = true;
            targetLabel.id = `${linkKey}-target`;
            graph.addCell(targetLabel, edge);
        }
    }

    /**
     * Apply an organic layout to the graph.
     * This function arranges the graph using the organic layout algorithm 
     * to ensure that the devices and links are placed in a visually appealing way.
     * 
     * @param {mxGraph} graph - The graph object to which the organic layout will be applied.
     */
    function organicLayout(graph) {
        const layout = new mxFastOrganicLayout(graph);
        const parent = graph.getDefaultParent();
        const movableCells = Object.values(graph.getModel().getCells()).filter(cell => graph.isCellMovable(cell));

        layout.vertexArray = movableCells;
        layout.forceConstant = 200;

        graph.getModel().beginUpdate();
        try {
            layout.execute(parent);
        } finally {
            graph.getModel().endUpdate();
        }
    }
});
