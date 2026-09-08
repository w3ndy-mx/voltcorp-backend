<script>
    async function cargarDetallePieza() {
        const urlParams = new URLSearchParams(window.location.search);
        const nombrePieza = urlParams.get('pieza') || "Componente de Hardware";

        document.getElementById('titulo-pieza').textContent = nombrePieza;

        // Mostrar estado provisional mientras consulta la caché/IA
        document.getElementById('texto-especificaciones').textContent = "Consultando base de datos / Búsqueda por IA...";
        document.getElementById('texto-recomendacion').textContent = "Analizando componente...";
        document.getElementById('texto-porque-comprar').textContent = "Calculando propuesta de valor...";

        try {
            // Petición al backend que gestiona la caché y la IA
            const response = await fetch(`https://voltcorp-backend.onrender.com/api/detalle?pieza=${encodeURIComponent(nombrePieza)}`);
            
            if (!response.ok) throw new Error("Error en la respuesta del servidor");

            const datos = await response.json();

            // Insertar datos dinámicos devueltos por la IA o memoria
            document.getElementById('texto-especificaciones').textContent = datos.especificaciones;
            document.getElementById('texto-recomendacion').textContent = datos.recomendacion;
            document.getElementById('texto-porque-comprar').textContent = datos.porqueComprar;

            // Actualizar semáforo de resoluciones (1080p, 1440p, 4K)
            if (datos.res) {
                actualizarCirculo('1080p', datos.res.r1080);
                actualizarCirculo('1440p', datos.res.r1440);
                actualizarCirculo('4k', datos.res.r4k);
            }

            // Renderizar enlaces de tiendas
            renderizarTiendas(datos.tiendas, nombrePieza);

        } catch (error) {
            console.error("Error al obtener detalles:", error);
            document.getElementById('texto-especificaciones').textContent = "No se pudo cargar la información de este componente.";
            document.getElementById('texto-recomendacion').textContent = "Intenta recargar la página.";
            document.getElementById('texto-porque-comprar').textContent = "Información no disponible temporalmente.";
        }
    }

    function actualizarCirculo(idRes, datos) {
        if (!datos) return;
        const dotElem = document.getElementById(`dot-${idRes}`);
        const descElem = document.getElementById(`desc-${idRes}`);
        
        dotElem.className = `status-dot ${datos.color}`;
        descElem.textContent = datos.texto;
    }

    function renderizarTiendas(tiendas, nombrePieza) {
        const contenedor = document.getElementById('contenedor-tiendas');
        
        const listaTiendas = (tiendas && tiendas.length > 0) ? tiendas : [
            { nombre: "Amazon", precio: "Buscar oferta", url: `https://www.amazon.com/s?k=${encodeURIComponent(nombrePieza)}` },
            { nombre: "Mercado Libre", precio: "Buscar oferta", url: `https://listado.mercadolibre.com/${encodeURIComponent(nombrePieza)}` }
        ];

        contenedor.innerHTML = listaTiendas.map(tienda => `
            <a href="${tienda.url}" target="_blank" class="store-item">
                <span><i class="fa-solid fa-cart-shopping" style="color: var(--neon-blue); margin-right: 8px;"></i> ${tienda.nombre}</span>
                <strong style="color: var(--neon-blue);">${tienda.precio} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.8rem; margin-left: 5px;"></i></strong>
            </a>
        `).join('');
    }

    document.addEventListener('DOMContentLoaded', cargarDetallePieza);
</script>
