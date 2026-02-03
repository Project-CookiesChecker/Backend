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

        const processedNodes = data.nodes.map(node => {
            if (targetSite && node.label === targetSite) {
                return {
                    ...node,
                    size: 40,
                    color: { background: '#1e8449', border: '#145a32' }, // สีเขียวเข้มสำหรับจุดหลัก
                    font: { size: 18, weight: 'bold' }
                };
            }
            return node;
        });

        const networkData = { 
            nodes: new vis.DataSet(processedNodes), 
            edges: new vis.DataSet(data.edges) 
        };

        const options = {
            nodes: { shape: 'dot', size: 25 },
            groups: {
                website: { color: '#2ecc71' },
                tracker: { color: '#e74c3c' }
            },
            edges: {
                arrows: { to: { enabled: true } }, // แสดงลูกศรชี้ไปยังผู้รับข้อมูล
                font: { size: 10, align: 'top', color: '#666' },
                color: '#bdc3c7'
            },
            physics: {
                enabled: true,
                barnesHut: {
                    gravitationalConstant: -12000, // ผลักกันแรงขึ้นเพื่อไม่ให้ทับกัน
                    springLength: 200
                },
                stabilization: { iterations: 150 } // ให้กราฟคำนวณตำแหน่งให้เสร็จก่อนโชว์
            }
        };

        new vis.Network(container, networkData, options);

    } catch (err) {
        console.error("Graph Error:", err);
    }
}