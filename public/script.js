// Check application health and load metrics
async function checkHealth() {
    try {
        const response = await fetch('/health');
        const health = await response.json();
        
        document.getElementById('healthStatus').textContent = 
            `✅ Healthy - Version ${health.version}`;
        document.getElementById('version').textContent = health.version;
    } catch (error) {
        document.getElementById('healthStatus').textContent = '❌ Unhealthy';
        document.getElementById('healthStatus').style.color = '#dc3545';
    }
}

async function loadMetrics() {
    try {
        const response = await fetch('/metrics');
        const metrics = await response.json();
        
        document.getElementById('uptime').textContent = 
            `${Math.floor(metrics.uptime)} seconds`;
        
        document.getElementById('memory').textContent = 
            `${Math.round(metrics.memory.rss / 1024 / 1024)} MB`;
    } catch (error) {
        console.error('Failed to load metrics:', error);
    }
}

// Load data on page load and refresh every 10 seconds
document.addEventListener('DOMContentLoaded', () => {
    checkHealth();
    loadMetrics();
    
    setInterval(() => {
        checkHealth();
        loadMetrics();
    }, 10000);
});