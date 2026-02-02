document.addEventListener('DOMContentLoaded', () => {
    loadGraph();
    document.getElementById('refreshBtn').addEventListener('click', loadGraph);
});

async function loadGraph() {
    try {
        console.log("Fetching graph data...");

        // ใช้ 127.0.0.1 และดึงรวมเลย (ไม่ต้องเช็ก ?site=...)
        const apiUrl = 'http://127.0.0.1:5000/graph-data';
        
        console.log("Calling API:", apiUrl);

        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const data = await response.json();
        const container = document.getElementById('mynetwork');
        
        if (typeof vis === 'undefined') {
            throw new Error("Library 'vis' not found.");
        }

        const nodes = new vis.DataSet(data.nodes);
        const edges = new vis.DataSet(data.edges);
        const networkData = { nodes: nodes, edges: edges };

        const options = {
            nodes: {
                shape: 'dot',
                size: 20,
                font: { size: 14 }
            },
            groups: {
                website: { color: { background: '#2ecc71', border: '#27ae60' }, shape: 'dot' },
                tracker: { color: { background: '#e74c3c', border: '#c0392b' }, shape: 'dot' }
            },
            physics: {
                stabilization: false,
                barnesHut: { gravitationalConstant: -3000 }
            }
        };

        new vis.Network(container, networkData, options);

    } catch (err) {
        console.error("Graph Error:", err);
        alert("เกิดข้อผิดพลาด: " + err.message + "\n(เช็ก Python Server หรือกด Reload Extension)");
    }
}