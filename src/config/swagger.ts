import swaggerJsdoc from "swagger-jsdoc";

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "AskIndia API",
      version: "1.0.0",
      description: "AskIndia marketplace backend",
    },
    servers: [{ url: "http://localhost:5000/api/v1" }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
    // applies bearer auth to every route by default
    security: [{ bearerAuth: [] }],
  },
  // files swagger-jsdoc scans for @openapi comments
  apis: ["./src/modules/**/*.routes.ts"],
});
