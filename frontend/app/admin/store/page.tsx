import { getTranslations } from 'next-intl/server';
import StorePageClient from './StorePageClient';

export async function generateMetadata() {
  const t = await getTranslations({ locale: 'fr', namespace: 'admin.store' });
  return { title: t('title') };
}

export default function AdminStorePage() {
  return <StorePageClient />;
}
/*
'use client'

import { useState } from 'react'
import { useAdminGET, useAdminPOST, useAdminPUT, useAdminDELETE } from '@/lib/api/hooks'
import { DeleteConfirmDialog } from '@/components/admin/DeleteConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Edit, Trash2, Package, Tag, DollarSign } from 'lucide-react'
import { Product } from '@/lib/api/types'

// Product categories (should match backend)
const CATEGORIES = [
  'Toys',
  'Books',
  'Games',
  'Clothing',
  'Accessories',
  'Other'
]

export default function AdminProductsPage() {
  const { data: products, loading, error, refetch } = useAdminGET<Product[]>('/products')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    nameFr: '',
    nameAr: '',
    descriptionFr: '',
    descriptionAr: '',
    price: 0,
    stock: 0,
    category: '',
    imageUrl: '',
  })

  const { execute: createProduct, loading: createLoading } = useAdminPOST('/products')
  const { execute: updateProduct, loading: updateLoading } = useAdminPUT(`/products/${selectedProduct?.id}`)
  const { execute: deleteProduct, loading: deleteLoading } = useAdminDELETE(`/products/${productToDelete?.id}`)

  const handleOpenDialog = (product?: Product) => {
    if (product) {
      setSelectedProduct(product)
      setFormData({
        nameFr: product.nameFr,
        nameAr: product.nameAr,
        descriptionFr: product.descriptionFr,
        descriptionAr: product.descriptionAr,
        price: product.price,
        stock: product.stock,
        category: product.category,
        imageUrl: product.imageUrl || '',
      })
    } else {
      setSelectedProduct(null)
      setFormData({
        nameFr: '',
        nameAr: '',
        descriptionFr: '',
        descriptionAr: '',
        price: 0,
        stock: 0,
        category: '',
        imageUrl: '',
      })
    }
    setDialogOpen(true)
  }

  const handleSave = async () => {
    try {
      if (selectedProduct) {
        await updateProduct(formData)
      } else {
        await createProduct(formData)
      }
      refetch()
      setDialogOpen(false)
    } catch (error) {
      // Error handled by hook
    }
  }

  const handleDelete = async (deleteCode: string) => {
    if (!productToDelete) return
    try {
      await deleteProduct({ deleteCode })
      refetch()
      setDeleteDialogOpen(false)
      setProductToDelete(null)
    } catch (error) {
      // Error handled
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-bold">Products Management</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="w-4 h-4 mr-2" /> New Product
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedProduct ? 'Edit Product' : 'Create New Product'}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="nameFr">Name (French)</Label>
                  <Input
                    id="nameFr"
                    value={formData.nameFr}
                    onChange={(e) => setFormData({...formData, nameFr: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="nameAr">Name (Arabic)</Label>
                  <Input
                    id="nameAr"
                    value={formData.nameAr}
                    onChange={(e) => setFormData({...formData, nameAr: e.target.value})}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="descriptionFr">Description (French)</Label>
                  <Textarea
                    id="descriptionFr"
                    value={formData.descriptionFr}
                    onChange={(e) => setFormData({...formData, descriptionFr: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="descriptionAr">Description (Arabic)</Label>
                  <Textarea
                    id="descriptionAr"
                    value={formData.descriptionAr}
                    onChange={(e) => setFormData({...formData, descriptionAr: e.target.value})}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="price">Price (TND)</Label>
                  <Input
                    id="price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({...formData, price: parseFloat(e.target.value) || 0})}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="stock">Stock</Label>
                  <Input
                    id="stock"
                    type="number"
                    min="0"
                    value={formData.stock}
                    onChange={(e) => setFormData({...formData, stock: parseInt(e.target.value) || 0})}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({...formData, category: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="imageUrl">Image URL (optional)</Label>
                  <Input
                    id="imageUrl"
                    value={formData.imageUrl}
                    onChange={(e) => setFormData({...formData, imageUrl: e.target.value})}
                    placeholder="https://..."
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={createLoading || updateLoading}>
                {selectedProduct ? 'Update' : 'Create'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading && <div>Loading products...</div>}
      {error && <div className="text-red-500">Error: {error.message}</div>}
      {products && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name (FR)</TableHead>
                <TableHead>Name (AR)</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.nameFr}</TableCell>
                  <TableCell className="font-arabic">{product.nameAr}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Tag className="w-4 h-4 text-gray-400" />
                      {product.category}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <DollarSign className="w-4 h-4 text-gray-400" />
                      {product.price} TND
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Package className="w-4 h-4 text-gray-400" />
                      {product.stock}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(product)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-600"
                        onClick={() => {
                          setProductToDelete(product)
                          setDeleteDialogOpen(true)
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Delete Product"
        description={`Are you sure you want to delete "${productToDelete?.nameFr}"? This will soft-delete the product.`}
        loading={deleteLoading}
      />
    </div>
  )
}*/