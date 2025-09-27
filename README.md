# Notion ChatGPT Agent

Agente de ChatGPT que automatiza el filleo de una base de datos de Notion de películas y series.

## Características

- Búsqueda automática de información usando TMDB API
- Integración directa con Notion
- Compatible con GPT Actions
- Manejo de errores robusto

## Configuración

1. Clona el repositorio
2. Instala dependencias: `npm install`
3. Configura variables de entorno (ver `.env.example`)
4. Ejecuta: `npm start`

## Variables de Entorno

- `NOTION_TOKEN`: Token de integración de Notion
- `DATABASE_ID`: ID de la base de datos de Notion
- `TMDB_API_KEY`: API Key de The Movie Database

## Endpoints

- `GET /`: Estado del servidor
- `POST /add-movie`: Agregar película/serie

## Despliegue

Compatible con Render, Heroku, Railway y otros servicios de hosting.