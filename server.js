const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Client } = require('@notionhq/client');
const axios = require('axios');

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Configuración de clientes
const notion = new Client({ 
    auth: process.env.NOTION_TOKEN 
});
const DATABASE_ID = process.env.DATABASE_ID;
const TMDB_API_KEY = process.env.TMDB_API_KEY;

// Mapeo de géneros TMDB a tus opciones de Notion
const genreMap = {
    28: 'Action', 12: 'Action', 16: 'Comedy', 35: 'Comedy',
    80: 'Crime', 99: 'Drama', 18: 'Drama', 10751: 'Comedy',
    14: 'Science fiction', 36: 'Drama', 27: 'Horror', 10402: 'Drama',
    9648: 'Thriller', 10749: 'Romance', 878: 'Science fiction',
    10770: 'Drama', 53: 'Thriller', 10752: 'Action', 37: 'Action',
    // Series
    10759: 'Action', 10762: 'Comedy', 10763: 'Drama',
    10764: 'Comedy', 10765: 'Science fiction', 10766: 'Drama',
    10767: 'Comedy', 10768: 'Drama'
};

// Géneros adicionales basados en palabras clave
function mapGenresByKeywords(overview, title) {
    const text = (overview + ' ' + title).toLowerCase();
    const genres = [];
    
    if (text.includes('superhero') || text.includes('marvel') || text.includes('dc comics') || 
        text.includes('batman') || text.includes('superman') || text.includes('spider')) {
        genres.push('Superhero');
    }
    if (text.includes('dystopian') || text.includes('dystopia') || text.includes('apocalypse')) {
        genres.push('Dystopian');
    }
    if (text.includes('future') || text.includes('space') || text.includes('alien')) {
        if (!genres.includes('Science fiction')) genres.push('Science fiction');
    }
    if (text.includes('love') || text.includes('romantic')) {
        if (!genres.includes('Romance')) genres.push('Romance');
    }
    if (text.includes('scary') || text.includes('haunted') || text.includes('demon')) {
        if (!genres.includes('Horror')) genres.push('Horror');
    }
    
    return genres;
}

// Función para obtener géneros mapeados
function getMappedGenres(genreIds, overview, title) {
    let genres = [];
    
    // Mapear géneros de TMDB a tus opciones
    if (genreIds && genreIds.length > 0) {
        genres = genreIds.map(id => genreMap[id]).filter(Boolean);
    }
    
    // Agregar géneros basados en palabras clave
    const keywordGenres = mapGenresByKeywords(overview, title);
    keywordGenres.forEach(genre => {
        if (!genres.includes(genre)) {
            genres.push(genre);
        }
    });
    
    // Si no se encontraron géneros, usar Drama como default
    if (genres.length === 0) {
        genres = ['Drama'];
    }
    
    // Limitar a máximo 3 géneros para evitar sobrecarga
    return genres.slice(0, 3).join(', ');
}

// Función para convertir rating de TMDB (0-10) a tu sistema de estrellas (1-5)
function convertRating(tmdbRating) {
    if (!tmdbRating || tmdbRating === 0) return 3; // Default 3 estrellas
    
    // Convertir de escala 0-10 a 1-5
    const convertedRating = Math.round((tmdbRating / 2));
    
    // Asegurar que esté en rango 1-5
    return Math.max(1, Math.min(5, convertedRating));
}

// Ruta principal de prueba
app.get('/', (req, res) => {
    res.json({ 
        message: 'Notion ChatGPT Agent API funcionando correctamente',
        status: 'active',
        endpoints: ['/add-movie']
    });
});

// Endpoint principal para agregar películas/series
app.post('/add-movie', async (req, res) => {
    try {
        const { title } = req.body;
        
        if (!title) {
            return res.status(400).json({ 
                success: false, 
                error: 'El título es requerido' 
            });
        }

        console.log(`Buscando: ${title}`);
        
        // Buscar información en TMDB
        const movieData = await searchMovieData(title);
        console.log('Datos encontrados:', movieData.title);
        
        // Crear entrada en Notion
        const result = await createNotionPage(movieData);
        console.log('Página creada en Notion');
        
        res.json({ 
            success: true, 
            message: `"${movieData.title}" agregada exitosamente a la base de datos`,
            data: {
                title: movieData.title,
                type: movieData.type,
                releaseDate: movieData.releaseDate,
                rating: movieData.rating
            },
            notion_url: result.url 
        });
        
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Función para buscar datos de la película/serie
async function searchMovieData(title) {
    try {
        const response = await axios.get(
            `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=en-US`
        );
        
        const item = response.data.results[0];
        if (!item) {
            throw new Error('Película/Serie no encontrada en la base de datos');
        }
        
        const movieTitle = item.title || item.name;
        const overview = item.overview || 'Sin resumen disponible';
        const mediaType = item.media_type === 'movie' ? 'Movie' : 'Serie';
        
        return {
            title: movieTitle,
            releaseDate: item.release_date || item.first_air_date,
            type: mediaType,
            genre: getMappedGenres(item.genre_ids, overview, movieTitle),
            summary: overview,
            cover: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
            rating: convertRating(item.vote_average)
        };
    } catch (error) {
        throw new Error(`Error al buscar información: ${error.message}`);
    }
}

// Función para crear página en Notion
async function createNotionPage(data) {
    try {
        const properties = {
            'Exp': {
                title: [{ text: { content: data.title } }]
            },
            'Type': {
                select: { name: data.type } // "Movie" o "Serie"
            },
            'Genre': {
                rich_text: [{ text: { content: data.genre } }]
            },
            'Summary': {
                rich_text: [{ text: { content: data.summary } }]
            },
            'Status': {
                select: { name: 'Unseen' } // Default status
            },
            'Rating': {
                number: data.rating // Ahora será 1-5 en lugar de 0-10
            }
        };

        // Agregar fecha solo si existe
        if (data.releaseDate) {
            properties['Release date'] = {
                date: { start: data.releaseDate }
            };
        }

        // Agregar cover solo si existe - usando Files & media type
        if (data.cover) {
            properties['Cover'] = {
                files: [
                    {
                        type: "external",
                        name: `${data.title} - Poster`,
                        external: {
                            url: data.cover
                        }
                    }
                ]
            };
        }

        return await notion.pages.create({
            parent: { database_id: DATABASE_ID },
            properties: properties
        });
    } catch (error) {
        console.error('Detalles del error de Notion:', error.body || error.message);
        throw new Error(`Error al crear página en Notion: ${error.message}`);
    }
}

// Manejo de errores global
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        success: false, 
        error: 'Error interno del servidor' 
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en puerto ${PORT}`);
    console.log(`Entorno: ${process.env.NODE_ENV || 'development'}`);
});