document.addEventListener('DOMContentLoaded', () => {
    loadGraph();
    document.getElementById('refreshBtn').addEventListener('click', loadGraph);
});

async function loadGraph() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const targetSite = urlParams.get('site');
        
        let apiUrl = 'http://127.0.0.1:5000/graph-data';
        if (targetSite) {
            apiUrl += `?site=${encodeURIComponent(targetSite)}`;
        }

        const response = await fetch(apiUrl);
        const data = await response.json();
        const container = document.getElementById('mynetwork');

        // --- 1. จัดการข้อมูล Nodes (จุด) ---
        const processedNodes = data.nodes.map(node => {
            if (targetSite && node.label === targetSite) {
                return {
                    ...node,
                    size: 40,
                    color: { 
                        background: '#1e8449', 
                        border: '#145a32',
                        highlight: { background: '#27ae60', border: '#1e8449' }
                    },
                    font: { size: 18, weight: 'bold' }
                };
            }
            return node;
        });

        // --- 2. จัดการข้อมูล Edges (เส้น) แยกตามประเภทคุกกี้ ---
        const processedEdges = data.edges.map(edge => {
            let edgeColor = '#bdc3c7'; // สีเทาเริ่มต้น (Default)
            
            // แปลงเป็นตัวพิมพ์ใหญ่เพื่อให้เช็คเงื่อนไขได้แม่นยำขึ้น
            const type = edge.label ? edge.label.toUpperCase() : '';

            // Mapping สีตาม Settings ใน Extension
            if (type.includes('NECESSARY') || type.includes('STRICTLY')) {
                edgeColor = '#2ecc71'; // สีเขียว: Strictly Necessary
            } 
            else if (type.includes('PERFORMANCE') || type.includes('ANALYTICS') || type.includes('STATISTICS')) {
                edgeColor = '#f1c40f'; // สีเหลือง: Performance
            } 
            else if (type.includes('FUNCTIONALITY')) {
                edgeColor = '#3498db'; // สีฟ้า: Functionality
            } 
            else if (type.includes('TARGETING') || type.includes('ADVERTISING') || type.includes('ADS') || type.includes('TRACKING')) {
                edgeColor = '#e74c3c'; // สีแดง: Ads / Tracking
            }

            return {
                ...edge,
                color: {
                    color: edgeColor,
                    highlight: '#2c3e50',
                    hover: edgeColor,
                    opacity: 0.8
                },
                width: 2,
                font: { 
                    size: 10, 
                    align: 'top', 
                    color: '#34495e',
                    background: '#ffffff',
                    strokeWidth: 0
                }
            };
        });

        const networkData = { 
            nodes: new vis.DataSet(processedNodes), 
            edges: new vis.DataSet(processedEdges) 
        };

        // --- 3. การตั้งค่า Configuration ของ vis.js ---
        const options = {
            nodes: { 
                shape: 'dot', 
                size: 25,
                font: { face: 'Tahoma' }
            },
            groups: {
                website: { color: { background: '#2ecc71', border: '#27ae60' } },
                tracker: { color: { background: '#e74c3c', border: '#c0392b' } }
            },
            edges: {
                arrows: { 
                    to: { enabled: true, scaleFactor: 0.6 } 
                },
                smooth: {
                    type: 'curvedCW',
                    roundness: 0.15
                }
            },
            interaction: {
                hover: true,
                tooltipDelay: 300,
                navigationButtons: false 
            },
            physics: {
                enabled: true,
                barnesHut: {
                    gravitationalConstant: -15000,
                    centralGravity: 0.3,
                    springLength: 200,
                    springConstant: 0.04,
                    damping: 0.09
                },
                stabilization: { 
                    iterations: 150,
                    updateInterval: 25
                }
            }
        };

        new vis.Network(container, networkData, options);

    } catch (err) {
        console.error("Graph Error:", err);
        alert("Could not load graph data. Please check API connection.");
    }
}